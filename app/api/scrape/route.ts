/**
 * Unified Streaming Scrape API endpoint
 * Real-time event extraction with Server-Sent Events
 */
import { NextRequest, NextResponse } from 'next/server';

import { createAnthropicClient } from '@/lib/api/services/anthropic-ai';
import { streamScrapeEvents } from '@/lib/api/services/scraper-orchestrator';
import { ErrorCode, ScraperConfig, ScraperError } from '@/lib/api/types/index';
import { validateConfig } from '@/lib/api/utils/config';
import {
  createRequestLogger,
  elapsed,
  generateRequestId,
  type Logger,
} from '@/lib/api/utils/logger';
import type { Anthropic } from '@anthropic-ai/sdk';

export const maxDuration = 300; // 5 minutes

/**
 * Create Anthropic client
 */
function createClient(log: Logger): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.error('ANTHROPIC_API_KEY not configured');
    throw new ScraperError(
      'ANTHROPIC_API_KEY not configured',
      ErrorCode.CONFIGURATION_ERROR,
      { message: 'AI service configuration required' },
      false
    );
  }

  log.debug('Anthropic client created');
  return createAnthropicClient({
    apiKey,
    model: 'claude-haiku-4-5-20251001',
    maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
  });
}

/**
 * POST - Stream scraping with real-time updates
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const log = createRequestLogger({
    requestId,
    url: '/api/scrape',
    method: 'POST',
  });

  const startTime = Date.now();

  try {
    const body = await request.json();
    const config: ScraperConfig = validateConfig(body);

    log.info({ targetUrl: config.source.url }, 'Scrape request received');
    log.debug({ config: { ...config, processing: { ...config.processing, ai: { ...config.processing?.ai, apiKey: '[REDACTED]' } } } }, 'Request configuration');

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start async processing
    (async () => {
      let eventCount = 0;
      try {
        const anthropicClient = createClient(log);

        log.info('Starting streaming pipeline');

        // Stream all updates to client
        for await (const update of streamScrapeEvents(config, anthropicClient, log)) {
          if (update.type === 'event') {
            eventCount++;
            log.debug({ eventCount, title: update.data.title }, 'Event streamed to client');
          } else if (update.type === 'status') {
            log.debug({ status: update.data.message }, 'Status update');
          } else if (update.type === 'complete') {
            log.info(
              {
                totalEvents: update.data.metadata.totalEvents,
                processedEvents: update.data.metadata.processedEvents,
                failedEvents: update.data.metadata.failedEvents,
                processingTimeMs: update.data.metadata.processingTime,
                hasIcs: !!update.data.icsContent,
              },
              'Streaming complete'
            );
          }

          const message = JSON.stringify(update);
          await writer.write(encoder.encode(`data: ${message}\n\n`));
        }

        log.info({ durationMs: elapsed(startTime), eventCount }, 'Request completed successfully');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error({ err, durationMs: elapsed(startTime) }, 'Streaming pipeline error');

        const errorMessage = JSON.stringify({
          type: 'error',
          data: {
            code: error instanceof ScraperError ? error.code : ErrorCode.INTERNAL_ERROR,
            message: err.message,
          },
        });
        await writer.write(encoder.encode(`data: ${errorMessage}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ err, durationMs: elapsed(startTime) }, 'Stream setup error');

    if (error instanceof ScraperError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            retryable: error.retryable,
          },
          requestId,
        },
        {
          status: 500,
          headers: { 'X-Request-Id': requestId },
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to initialize streaming',
          retryable: false,
        },
        requestId,
      },
      {
        status: 500,
        headers: { 'X-Request-Id': requestId },
      }
    );
  }
}

/**
 * GET - API information
 */
export async function GET() {
  return NextResponse.json({
    service: 'Unified Streaming Event Scraper',
    version: '2.0.0',
    description: 'Real-time event extraction with SSE streaming',
    model: 'claude-haiku-4-5-20251001',
    features: [
      'Server-Sent Events (SSE) streaming',
      'Real-time event extraction',
      'Automatic continuation on token limits',
      '64K token output support',
      'Duplicate detection',
      'Auto-retry on overload',
      'Request tracing with unique IDs',
    ],
    endpoints: {
      POST: {
        description: 'Stream events in real-time as they are extracted',
        contentType: 'text/event-stream',
        eventTypes: {
          status: 'Progress messages',
          event: 'Individual calendar event',
          complete: 'Final result with ICS content',
          error: 'Error information',
        },
      },
    },
  });
}
