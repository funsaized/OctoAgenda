/**
 * Cron job API endpoint
 * Handles scheduled scraping tasks
 */
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import {
  createRequestLogger,
  elapsed,
  generateRequestId,
} from '@/lib/api/utils/logger';

// Configure runtime for Node.js compatibility
export const maxDuration = 300; // 5 minutes

/**
 * GET handler for cron job execution
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const log = createRequestLogger({
    requestId,
    url: '/api/cron',
    method: 'GET',
  });

  const startTime = Date.now();
  log.info('Cron job triggered');

  try {
    // Verify cron authorization (Vercel Cron Secret)
    const authHeader = (await headers()).get('authorization');
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        log.warn('Unauthorized cron request attempt');
        return NextResponse.json(
          { error: 'Unauthorized', requestId },
          { status: 401, headers: { 'X-Request-Id': requestId } }
        );
      }
      log.debug('Cron authorization verified');
    } else {
      log.warn('CRON_SECRET not configured - running without auth check');
    }

    // Get the source URL from environment or use default
    const sourceUrl = process.env.SOURCE_URL;
    if (!sourceUrl) {
      log.error('SOURCE_URL not configured');
      return NextResponse.json(
        { error: 'SOURCE_URL not configured', requestId },
        { status: 500, headers: { 'X-Request-Id': requestId } }
      );
    }

    log.info({ sourceUrl }, 'Starting scheduled scrape');

    // Call the scrape endpoint internally
    const scrapeUrl = new URL('/api/scrape', request.url);
    log.debug({ scrapeUrl: scrapeUrl.toString() }, 'Calling scrape endpoint');

    const response = await fetch(scrapeUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: sourceUrl,
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        timezone: process.env.DEFAULT_TIMEZONE,
        calendarName: 'Automated Scrape',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      log.error(
        { statusCode: response.status, error, durationMs: elapsed(startTime) },
        'Cron scraping failed'
      );
      return NextResponse.json(
        { success: false, error, requestId },
        { status: response.status, headers: { 'X-Request-Id': requestId } }
      );
    }

    const result = await response.json();
    const eventsCount = result.events?.length || 0;

    log.info(
      { eventsCount, durationMs: elapsed(startTime) },
      'Cron job completed successfully'
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Cron job executed successfully',
        eventsCount,
        timestamp: new Date().toISOString(),
        requestId,
      },
      { headers: { 'X-Request-Id': requestId } }
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ err, durationMs: elapsed(startTime) }, 'Cron job error');

    return NextResponse.json(
      {
        success: false,
        error: {
          message: err.message,
          timestamp: new Date().toISOString(),
        },
        requestId,
      },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    );
  }
}
