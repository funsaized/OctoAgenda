/**
 * Main scraping API endpoint
 * Handles HTTP requests to scrape events and generate ICS files
 */

import { NextRequest, NextResponse } from 'next/server';
import { scrapeEvents } from '@/lib/api/services/scraper-orchestrator';
import { ScraperConfig } from '@/lib/api/types/index';
import { createAnthropicClient } from '@/lib/api/services/anthropic-ai';
import type { Anthropic } from '@anthropic-ai/sdk';
import { initializeCache } from '@/lib/api/services/html-fetcher';
import { getICSHeaders } from '@/lib/api/services/ics-generator';
import { ScraperError, ErrorCode } from '@/lib/api/types/index';
import { validateConfig } from '@/lib/api/utils/config';

// Configure runtime for Node.js compatibility
export const maxDuration = 300; // 5 minutes

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
 * POST handler for scraping requests
 */
export async function POST(request: NextRequest) {
  // Initialize cache
  initializeCache({
    enabled: true,
    ttl: parseInt(process.env.CACHE_TTL || '3600000', 10),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '50', 10)
  });

  try {
    // Extract config from request
    const body = await request.json();
    const config: ScraperConfig = validateConfig(body);

    // Create Anthropic client
    const anthropicClient = createClient();

    // Perform scraping
    const { events, icsContent, metadata } = await scrapeEvents(
      config,
      anthropicClient
    );

    // Determine response type
    const acceptHeader = request.headers.get('accept');
    const preferICS = acceptHeader?.includes('text/calendar');

    if (preferICS && icsContent) {
      // Return ICS file
      const headers = new Headers(getICSHeaders(config.ics?.calendarName || 'Scraped Events'));
      return new NextResponse(icsContent, {
        status: 200,
        headers
      });
    }

    // Return JSON response
    return NextResponse.json({
      success: true,
      metadata,
      events,
      icsContent
    });

  } catch (error) {
    console.error('Scraping error:', error);

    if (error instanceof ScraperError) {
      return NextResponse.json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          retryable: error.retryable
        }
      }, { status: 500 });
    }

    // Generic error
    return NextResponse.json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        retryable: false
      }
    }, { status: 500 });
  }
}

/**
 * GET handler - returns API information
 */
export async function GET() {
  return NextResponse.json({
    service: 'Event Scraper API',
    version: '1.0.0',
    endpoints: {
      POST: {
        description: 'Scrape events from a URL and generate ICS file',
        parameters: {
          url: 'Source URL to scrape',
          batchSize: 'Number of events to process per batch (optional)',
          retryAttempts: 'Number of retry attempts for failed requests (optional)',
          timezone: 'Target timezone for events (optional)',
          calendarName: 'Name for the generated calendar (optional)'
        }
      }
    }
  });
}
