/**
 * Cron job API endpoint
 * Handles scheduled scraping tasks
 */
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Configure runtime for Node.js compatibility
export const maxDuration = 300; // 5 minutes

/**
 * GET handler for cron job execution
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron authorization (Vercel Cron Secret)
    const authHeader = (await headers()).get('authorization');
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Get the source URL from environment or use default
    const sourceUrl = process.env.SOURCE_URL;
    if (!sourceUrl) {
      return NextResponse.json({ error: 'SOURCE_URL not configured' }, { status: 500 });
    }

    // Call the scrape endpoint internally
    const scrapeUrl = new URL('/api/scrape', request.url);
    const response = await fetch(scrapeUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: sourceUrl,
        batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        timezone: process.env.DEFAULT_TIMEZONE,
        calendarName: 'Automated Scrape',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Cron scraping failed:', error);
      return NextResponse.json({ success: false, error }, { status: response.status });
    }

    const result = await response.json();
    console.log(`Cron job completed successfully. Events scraped: ${result.events?.length || 0}`);

    return NextResponse.json({
      success: true,
      message: 'Cron job executed successfully',
      eventsCount: result.events?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Cron job failed',
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}
