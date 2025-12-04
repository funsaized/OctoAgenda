/**
 * Scraper Orchestrator Service - STREAMING VERSION
 * Coordinates all services to extract events and generate ICS files with real-time streaming
 */
import {
  ExtractionContext,
  streamExtractEvents,
  validateExtraction,
} from '@/lib/api/services/anthropic-ai';
import { scrapeWithFirecrawl } from '@/lib/api/services/firecrawl-service';
import { generateICS } from '@/lib/api/services/ics-generator';
import {
  CalendarEvent,
  ErrorCode,
  ProcessingOptions,
  ScraperConfig,
  ScraperError,
  ScraperResult,
  SSEEvent,
} from '@/lib/api/types/index';
import type { Anthropic } from '@anthropic-ai/sdk';

/**
 * Default processing options
 */
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  cache: {
    enabled: true,
    ttl: 3600,
  },
  timezone: {
    default: 'America/New_York',
    autoDetect: true,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-haiku-4-5-20251001',
    maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
  },
};

/**
 * Stream scraping events with real-time updates
 */
export async function* streamScrapeEvents(
  config: ScraperConfig,
  anthropicClient: Anthropic
): AsyncGenerator<SSEEvent, void, unknown> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const processing = { ...DEFAULT_PROCESSING_OPTIONS, ...config.processing };
  const allEvents: CalendarEvent[] = [];

  try {
    // Step 1: Scrape with Firecrawl
    yield { type: 'status', data: { message: '🔥 Scraping page with Firecrawl...' } };

    const firecrawlResult = await scrapeWithFirecrawl(config.source.url, {
      formats: ['markdown'],
      timeout: config.source.timeout,
    });

    yield {
      type: 'status',
      data: {
        message: `✅ Page scraped (${firecrawlResult.markdown.length.toLocaleString()} chars)`,
      },
    };

    // Step 2: Extract context
    const context: ExtractionContext = {
      sourceUrl: config.source.url,
      timezoneHint: processing.timezone.default,
      currentDate: new Date(),
      language: firecrawlResult.metadata.language,
    };

    // Step 3: Stream events from AI
    yield { type: 'status', data: { message: '🤖 Extracting events with AI...' } };

    // Process entire markdown content at once with streaming
    for await (const event of streamExtractEvents(
      anthropicClient,
      firecrawlResult.markdown,
      context,
      processing.ai
    )) {
      allEvents.push(event);
      yield { type: 'event', data: event };
    }

    yield {
      type: 'status',
      data: { message: `✅ Extracted ${allEvents.length} events` },
    };

    // Step 4: Validate
    yield { type: 'status', data: { message: '🔍 Validating events...' } };

    const validation = validateExtraction(allEvents);

    if (validation.errors.length > 0) {
      warnings.push(...validation.errors.map((e) => e.message));
    }

    // Step 5: Generate ICS (only full calendar file, no individual files)
    yield { type: 'status', data: { message: '📅 Generating calendar file...' } };

    let icsContent: string | undefined;

    if (validation.validatedEvents.length > 0) {
      icsContent = generateICS(validation.validatedEvents, config.ics);
    }

    const processingTime = Date.now() - startTime;

    console.log(`\n=== SENDING COMPLETE EVENT ===`);
    console.log(`ICS content length: ${icsContent?.length || 0} chars`);
    console.log(`Total events: ${validation.validatedEvents.length}`);

    // Final result
    yield {
      type: 'complete',
      data: {
        events: validation.validatedEvents,
        icsContent,
        metadata: {
          totalEvents: allEvents.length,
          processedEvents: validation.validatedEvents.length,
          failedEvents: validation.invalidEvents.length,
          processingTime,
          warnings,
        },
      } as ScraperResult,
    };

    console.log(`✅ Complete event sent`);
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(`Scraping failed: ${error}`, ErrorCode.INTERNAL_ERROR, { error }, false);
  }
}

/**
 * Create scraper config from environment variables
 */
export function createConfigFromEnv(): ScraperConfig {
  return {
    source: {
      url: process.env.SOURCE_URL || '',
      userAgent: process.env.SOURCE_USER_AGENT,
      selectors: process.env.SOURCE_SELECTOR
        ? {
            eventContainer: process.env.SOURCE_SELECTOR,
          }
        : undefined,
    },
    processing: {
      retry: {
        maxAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
      },
      timezone: {
        default: process.env.DEFAULT_TIMEZONE || 'America/New_York',
        autoDetect: process.env.DETECT_TIMEZONE !== 'false',
      },
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-haiku-4-5-20251001',
      },
    },
    ics: {
      calendarName: process.env.CALENDAR_NAME || 'Scraped Events',
      timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
      includeAlarms: process.env.INCLUDE_ALARMS !== 'false',
    },
  };
}
