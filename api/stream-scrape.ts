/**
 * Streaming scraping API endpoint
 * Provides real-time progress updates to prevent timeouts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  scrapeEvents,
  ScraperConfig
} from '../src/services/scraper-orchestrator.js';
import { createAnthropicClient } from '../src/services/anthropic-ai.js';
import type { Anthropic } from '@anthropic-ai/sdk';
import { initializeCache } from '../src/services/html-fetcher.js';
import { ScraperError, ErrorCode } from '../src/types/index.js';
import { validateConfig } from '../src/utils/config.js';

// Allow streaming responses up to 5 minutes (300 seconds)
export const maxDuration = 300;

/**
 * Create Anthropic client for this handler invocation
 */
function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ScraperError(
      'ANTHROPIC_API_KEY environment variable is not configured',
      ErrorCode.CONFIGURATION_ERROR,
      { message: 'AI service configuration is required for event extraction' },
      false
    );
  }
  
  return createAnthropicClient({
    apiKey,
    model: 'claude-3-haiku-20240307',
    maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10)
  });
}

/**
 * Get configuration from request
 */
async function getConfig(req: VercelRequest): Promise<ScraperConfig> {
  // Check if URL is provided in query or body
  const url = req.query.url || req.body?.url || process.env.SOURCE_URL;

  if (!url) {
    throw new ScraperError(
      'No URL provided',
      ErrorCode.CONFIGURATION_ERROR,
      { message: 'Please provide a URL to scrape' },
      false
    );
  }

  // Build configuration
  const config: ScraperConfig = {
    source: {
      url: url as string,
      userAgent: (req.query.userAgent || req.body?.userAgent || process.env.SOURCE_USER_AGENT) as string,
      selectors: req.body?.selectors,
      headers: req.body?.headers,
      timeout: req.body?.timeout ? parseInt(req.body.timeout as string, 10) : undefined
    },
    processing: {
      batchSize: req.body?.batchSize ? parseInt(req.body.batchSize, 20) : 20,
      timezone: {
        default: (req.query.timezone || req.body?.timezone || process.env.DEFAULT_TIMEZONE || 'America/New_York') as string,
        autoDetect: req.body?.autoDetectTimezone !== false
      },
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-haiku-20240307'
      },
      cache: {
        enabled: req.query.useCache !== 'false',
        ttl: 3600
      },
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },
    ics: {
      calendarName: (req.query.calendarName || req.body?.calendarName || 'Scraped Events') as string,
      includeAlarms: req.query.includeAlarms !== 'false',
      method: req.body?.inviteMode ? 'REQUEST' : 'PUBLISH'
    }
  };

  return config;
}

/**
 * Main streaming handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Initialize cache
  initializeCache({
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
    maxSize: 100,
    storage: 'memory'
  });

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET and POST methods are supported'
    });
    return;
  }

  try {
    // Get configuration
    const config = await getConfig(req);

    // Validate configuration
    const errors = validateConfig(config);
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Invalid configuration',
        errors
      });
      return;
    }

    // Set up streaming response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Helper function to send streaming data
    const sendUpdate = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Send initial status
      sendUpdate({
        status: 'starting',
        message: `Starting scrape of ${config.source.url}`,
        timestamp: new Date().toISOString()
      });

      // Create Anthropic client
      const anthropicClient = createClient();
      
      sendUpdate({
        status: 'initializing',
        message: 'AI client initialized, beginning scrape...',
        timestamp: new Date().toISOString()
      });

      // Perform the actual scraping with progress updates
      const startTime = Date.now();
      
      sendUpdate({
        status: 'fetching',
        message: 'Fetching HTML content...',
        timestamp: new Date().toISOString()
      });

      const scrapingResult = await scrapeEvents(config, anthropicClient);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      sendUpdate({
        status: 'processing_complete',
        message: `Processing complete! Found ${scrapingResult.events.length} events in ${processingTime}ms`,
        timestamp: new Date().toISOString()
      });

      // Send final result
      const format = req.query.format || req.body?.format || 'json';
      
      if (format === 'ics' && scrapingResult.icsContent) {
        sendUpdate({
          status: 'complete',
          message: 'ICS file generated successfully',
          data: {
            format: 'ics',
            content: scrapingResult.icsContent,
            filename: req.query.filename || 'events.ics'
          },
          events: scrapingResult.events.length,
          processingTime,
          timestamp: new Date().toISOString()
        });
      } else {
        sendUpdate({
          status: 'complete',
          message: 'Scraping completed successfully',
          data: {
            success: true,
            events: scrapingResult.events,
            metadata: scrapingResult.metadata,
            icsContent: scrapingResult.icsContent || null,
            ics: scrapingResult.icsContent ? {
              content: scrapingResult.icsContent,
              downloadUrl: `/api/scrape?format=ics&url=${encodeURIComponent(config.source.url)}`
            } : undefined
          },
          processingTime,
          timestamp: new Date().toISOString()
        });
      }

      // End the stream
      res.write('data: {"status": "end"}\n\n');
      res.end();

    } catch (error) {
      console.error('Streaming scraping error:', error);
      
      sendUpdate({
        status: 'error',
        message: error instanceof ScraperError ? error.message : 'An unexpected error occurred',
        error: {
          code: error instanceof ScraperError ? error.code : 'INTERNAL_ERROR',
          details: error instanceof ScraperError ? error.details : undefined,
          retryable: error instanceof ScraperError ? error.retryable : false
        },
        timestamp: new Date().toISOString()
      });
      
      res.write('data: {"status": "end"}\n\n');
      res.end();
    }

    return;

  } catch (error) {
    console.error('Streaming scraping error:', error);

    if (error instanceof ScraperError) {
      res.status(getErrorStatusCode(error.code)).json({
        error: error.code,
        message: error.message,
        details: error.details,
        retryable: error.retryable
      });
    } else {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      });
    }
  }
}

/**
 * Get HTTP status code for error
 */
function getErrorStatusCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.CONFIGURATION_ERROR:
    case ErrorCode.INVALID_EVENT_DATA:
    case ErrorCode.INVALID_DATE_FORMAT:
    case ErrorCode.MISSING_REQUIRED_FIELD:
      return 400;

    case ErrorCode.HTTP_NOT_FOUND:
      return 404;

    case ErrorCode.AI_RATE_LIMIT:
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;

    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.TIMEOUT:
    case ErrorCode.HTTP_SERVER_ERROR:
    case ErrorCode.AI_API_ERROR:
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}