/**
 * Scheduled execution endpoint
 * Handles automated scraping via Vercel cron jobs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  scrapeEvents,
  createConfigFromEnv,
  validateConfig
} from '../src/services/scraper-orchestrator.js';
import { initializeAnthropic } from '../src/services/anthropic-ai.js';
import { initializeCache } from '../src/services/html-fetcher.js';

/**
 * Webhook notification interface
 */
interface WebhookNotification {
  type: 'success' | 'error';
  timestamp: Date;
  eventsFound?: number;
  error?: string;
  metadata?: any;
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(notification: WebhookNotification): Promise<void> {
  const webhookUrl = process.env.MONITORING_WEBHOOK;

  if (!webhookUrl) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      console.error(`Webhook notification failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

/**
 * Initialize services
 */
function initializeServices(): void {
  // Initialize AI client
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    initializeAnthropic({
      apiKey,
      model: 'claude-3-haiku-20240307'
    });
  }

  // Initialize cache
  initializeCache({
    enabled: true,
    ttl: 3600,
    maxSize: 100,
    storage: 'memory'
  });
}

/**
 * Cron job handler
 */
export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Verify cron authorization (Vercel adds this header)
  const authHeader = _req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Initialize services
  initializeServices();

  const startTime = Date.now();
  console.log('Starting scheduled scraping job');

  try {
    // Get configuration from environment
    const config = createConfigFromEnv();

    // Validate configuration
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }

    // Perform scraping
    const result = await scrapeEvents(config);

    // Log results
    console.log(`Scraping completed: ${result.events.length} events found`);

    // Send success notification
    await sendWebhookNotification({
      type: 'success',
      timestamp: new Date(),
      eventsFound: result.events.length,
      metadata: {
        processingTime: result.metadata.processingTime,
        warnings: result.metadata.warnings,
        source: config.source.url
      }
    });

    // Store events if calendar integration is configured
    if (process.env.CALENDAR_ENDPOINT && result.events.length > 0) {
      await storeEventsInCalendar(result.events, result.icsContent);
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Scheduled scraping completed',
      events: result.events.length,
      processingTime: Date.now() - startTime,
      nextRun: getNextRunTime()
    });
  } catch (error) {
    console.error('Scheduled scraping failed:', error);

    // Send error notification
    await sendWebhookNotification({
      type: 'error',
      timestamp: new Date(),
      error: String(error),
      metadata: {
        processingTime: Date.now() - startTime
      }
    });

    // Return error response
    res.status(500).json({
      success: false,
      message: 'Scheduled scraping failed',
      error: process.env.NODE_ENV === 'development' ? String(error) : 'Internal error',
      nextRun: getNextRunTime()
    });
  }
}

/**
 * Store events in calendar service
 */
async function storeEventsInCalendar(
  _events: any[],
  _icsContent?: string
): Promise<void> {
  const endpoint = process.env.CALENDAR_ENDPOINT;
  const authUser = process.env.CALENDAR_AUTH_USER;
  const authPass = process.env.CALENDAR_AUTH_PASS;

  if (!endpoint || !_icsContent) {
    console.log('Calendar storage skipped: missing configuration');
    return;
  }

  try {
    // Basic CalDAV PUT request
    const auth = authUser && authPass ?
      Buffer.from(`${authUser}:${authPass}`).toString('base64') : '';

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar',
        'Authorization': auth ? `Basic ${auth}` : '',
        'If-None-Match': '*' // Only create, don't update
      },
      body: _icsContent
    });

    if (response.ok) {
      console.log('Events successfully stored in calendar');
    } else {
      console.error(`Failed to store events: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to store events in calendar:', error);
  }
}

/**
 * Get next scheduled run time
 */
function getNextRunTime(): string {
  // Parse cron schedule from vercel.json (daily at 6 AM UTC)
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(6, 0, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

/**
 * Health check endpoint (can be called separately)
 */
export async function health(
  _req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const hasSourceUrl = !!process.env.SOURCE_URL;
  const hasCalendarConfig = !!process.env.CALENDAR_ENDPOINT;

  res.status(200).json({
    status: 'healthy',
    configuration: {
      apiKeyConfigured: hasApiKey,
      sourceUrlConfigured: hasSourceUrl,
      calendarConfigured: hasCalendarConfig
    },
    nextRun: getNextRunTime(),
    timestamp: new Date().toISOString()
  });
}
