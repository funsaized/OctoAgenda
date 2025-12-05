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
import { createServiceLogger, elapsed, type Logger } from '@/lib/api/utils/logger';
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
  anthropicClient: Anthropic,
  parentLog: Logger
): AsyncGenerator<SSEEvent, void, unknown> {
  const log = createServiceLogger(parentLog, 'orchestrator');
  const startTime = Date.now();
  const warnings: string[] = [];
  const processing = { ...DEFAULT_PROCESSING_OPTIONS, ...config.processing };
  const allEvents: CalendarEvent[] = [];

  log.info({ url: config.source.url }, 'Starting scrape pipeline');

  try {
    // Step 1: Scrape with Firecrawl
    log.debug('Step 1: Initiating Firecrawl scrape');
    yield { type: 'status', data: { message: '🔥 Scraping page with Firecrawl...' } };

    const firecrawlLog = createServiceLogger(parentLog, 'firecrawl');
    const firecrawlResult = await scrapeWithFirecrawl(
      config.source.url,
      {
        formats: ['markdown'],
        timeout: config.source.timeout,
      },
      firecrawlLog
    );

    log.info(
      { markdownLength: firecrawlResult.markdown.length, title: firecrawlResult.metadata.title },
      'Firecrawl scrape complete'
    );

    yield {
      type: 'status',
      data: {
        message: `✅ Page scraped (${firecrawlResult.markdown.length.toLocaleString()} chars)`,
      },
    };

    // Step 2: Extract context
    log.debug('Step 2: Building extraction context');
    const context: ExtractionContext = {
      sourceUrl: config.source.url,
      timezoneHint: processing.timezone.default,
      currentDate: new Date(),
      language: firecrawlResult.metadata.language,
    };

    // Step 3: Stream events from AI
    log.debug('Step 3: Starting AI event extraction');
    yield { type: 'status', data: { message: '🤖 Extracting events with AI...' } };

    const aiLog = createServiceLogger(parentLog, 'anthropic');

    // Process entire markdown content at once with streaming
    for await (const event of streamExtractEvents(
      anthropicClient,
      firecrawlResult.markdown,
      context,
      processing.ai,
      aiLog
    )) {
      allEvents.push(event);
      yield { type: 'event', data: event };
    }

    log.info({ eventCount: allEvents.length }, 'AI extraction complete');

    yield {
      type: 'status',
      data: { message: `✅ Extracted ${allEvents.length} events` },
    };

    // Step 4: Validate
    log.debug('Step 4: Validating extracted events');
    yield { type: 'status', data: { message: '🔍 Validating events...' } };

    const validation = validateExtraction(allEvents);

    if (validation.errors.length > 0) {
      log.warn(
        { errorCount: validation.errors.length, errors: validation.errors.slice(0, 5) },
        'Validation warnings'
      );
      warnings.push(...validation.errors.map((e) => e.message));
    }

    log.debug(
      { validCount: validation.validatedEvents.length, invalidCount: validation.invalidEvents.length },
      'Validation complete'
    );

    // Step 5: Generate ICS
    log.debug('Step 5: Generating ICS file');
    yield { type: 'status', data: { message: '📅 Generating calendar file...' } };

    let icsContent: string | undefined;
    const icsLog = createServiceLogger(parentLog, 'ics-generator');

    if (validation.validatedEvents.length > 0) {
      icsContent = generateICS(validation.validatedEvents, config.ics, icsLog);
      log.debug({ icsLength: icsContent.length }, 'ICS file generated');
    } else {
      log.warn('No valid events to generate ICS');
    }

    const processingTime = Date.now() - startTime;

    log.info(
      {
        totalEvents: allEvents.length,
        validEvents: validation.validatedEvents.length,
        invalidEvents: validation.invalidEvents.length,
        warningCount: warnings.length,
        durationMs: processingTime,
      },
      'Scrape pipeline complete'
    );

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
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ err, durationMs: elapsed(startTime) }, 'Scrape pipeline failed');

    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(`Scraping failed: ${err.message}`, ErrorCode.INTERNAL_ERROR, { error: err.message }, false);
  }
}
