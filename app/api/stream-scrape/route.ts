/**
 * Streaming scrape API endpoint
 * Handles HTTP requests to scrape events with streaming responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAnthropicClient } from '@/lib/api/services/anthropic-ai';
import type { Anthropic } from '@anthropic-ai/sdk';
import { initializeCache } from '@/lib/api/services/html-fetcher';
import { ScraperError, ErrorCode } from '@/lib/api/types/index';
import { validateConfig } from '@/lib/api/utils/config';
import { ScraperConfig } from '@/lib/api/types/index';

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
 * POST handler for streaming scrape requests
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

    // Create a TransformStream for streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start async processing
    (async () => {
      try {
        // Send initial message
        await writer.write(encoder.encode('data: {"type":"start","message":"Starting event scraping..."}\n\n'));

        // Create Anthropic client
        const anthropicClient = createClient();

        // Import scraper
        const { scrapeEvents } = await import('@/lib/api/services/scraper-orchestrator');

        // Send progress update
        await writer.write(encoder.encode('data: {"type":"progress","message":"Fetching and processing events..."}\n\n'));

        // Perform scraping
        const result = await scrapeEvents(
          config,
          anthropicClient
        );

        // Send events one by one for streaming effect
        for (const event of result.events) {
          const message = JSON.stringify({
            type: 'event',
            event
          });
          await writer.write(encoder.encode(`data: ${message}\n\n`));
        }

        // Send completion message
        const completeMessage = JSON.stringify({
          type: 'complete',
          metadata: result.metadata,
          totalEvents: result.events.length,
          icsContent: result.icsContent
        });
        await writer.write(encoder.encode(`data: ${completeMessage}\n\n`));

      } catch (error) {
        console.error('Streaming error:', error);
        
        const errorMessage = JSON.stringify({
          type: 'error',
          error: {
            code: error instanceof ScraperError ? error.code : ErrorCode.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          }
        });
        await writer.write(encoder.encode(`data: ${errorMessage}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    // Return streaming response
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Stream setup error:', error);
    
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

    return NextResponse.json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to initialize streaming',
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
    service: 'Streaming Event Scraper API',
    version: '1.0.0',
    description: 'Server-sent events streaming for real-time scraping progress',
    endpoints: {
      POST: {
        description: 'Stream scraping progress and events in real-time',
        parameters: {
          url: 'Source URL to scrape',
          batchSize: 'Number of events to process per batch (optional)',
          retryAttempts: 'Number of retry attempts for failed requests (optional)',
          timezone: 'Target timezone for events (optional)',
          calendarName: 'Name for the generated calendar (optional)'
        },
        response: 'Server-sent event stream with progress updates'
      }
    }
  });
}