/**
 * Scraper Orchestrator Service
 * Coordinates all services to extract events and generate ICS files
 */
import {
  ExtractionContext,
  batchExtractEvents,
  validateExtraction,
} from '@/lib/api/services/anthropic-ai';
import { hasEventContent, preprocessHTML } from '@/lib/api/services/content-preprocessor';
import { fetchHTML } from '@/lib/api/services/html-fetcher';
import { generateICS, generateSingleEventICS } from '@/lib/api/services/ics-generator';
import {
  CalendarEvent,
  ErrorCode,
  ICSOptions,
  ProcessingOptions,
  Result,
  ScraperConfig,
  ScraperError,
  ScraperResult,
  SourceConfiguration,
} from '@/lib/api/types/index';
import type { Anthropic } from '@anthropic-ai/sdk';

// Types are now imported from the types file

/**
 * Default processing options
 */
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  batchSize: 5,
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
    model: 'claude-3-haiku-20240307',
    maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
  },
};

/**
 * Main scraper function
 */
export async function scrapeEvents(
  config: ScraperConfig,
  anthropicClient: Anthropic
): Promise<ScraperResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const processing = { ...DEFAULT_PROCESSING_OPTIONS, ...config.processing };

  try {
    // Step 1: Fetch HTML
    console.log(`Fetching HTML from ${config.source.url}`);
    const html = await fetchHTML(config.source.url, {
      headers: config.source.headers,
      userAgent: config.source.userAgent,
      timeout: config.source.timeout,
      useCache: processing.cache.enabled,
    });

    if (!html) {
      throw new ScraperError(
        'No HTML content received',
        ErrorCode.INVALID_HTML,
        { url: config.source.url },
        false
      );
    }

    // Step 2: Preprocess HTML
    console.log('Starting preprocess HTML content');
    const processedContent = preprocessHTML(html);

    if (!hasEventContent(processedContent)) {
      warnings.push('No event content detected in HTML');
    }

    // Step 3: Extract events using AI
    console.log('\n=== AI EXTRACTION STEP ===');
    console.log('Starting extracting events with AI');
    let events: CalendarEvent[] = [];
    try {
      events = await extractEventsFromContent(
        processedContent,
        config.source,
        processing,
        anthropicClient
      );
      console.log(`AI extraction successful: ${events.length} events extracted`);
    } catch (extractionError: any) {
      console.log(`AI extraction error: ${extractionError.message}`);
      console.log('Extraction error details:', extractionError);
      // Re-throw the error since this is a critical failure
      throw extractionError;
    }

    // Step 4: Validate extracted events
    console.log(`\n=== VALIDATION STEP ===`);
    console.log(`Events to validate: ${events.length}`);
    if (events.length > 0) {
      console.log('Sample events for validation:');
      events.slice(0, 3).forEach((event, idx) => {
        console.log(`  ${idx + 1}. \"${event.title}\" - ${event.startTime.toISOString()}`);
      });
    }

    const validation = validateExtraction(events);
    console.log(`Validation result: ${validation.valid ? 'VALID' : 'INVALID'}`);
    console.log(`Valid events: ${validation.validatedEvents.length}`);
    console.log(`Invalid events: ${validation.invalidEvents.length}`);
    console.log(`Validation errors: ${validation.errors.length}`);

    if (!validation.valid) {
      console.log('Validation errors:');
      validation.errors.forEach((error, idx) => {
        console.log(
          `  ${idx + 1}. ${error.message} (event ${error.eventIndex}, field: ${error.field})`
        );
      });
      warnings.push(...validation.errors.map((e) => e.message));
    }

    // Step 5: Generate ICS files
    let icsContent: string | undefined;
    let individualICS: Map<string, string> | undefined;

    if (validation.validatedEvents.length > 0) {
      console.log(`Generating ICS files for ${validation.validatedEvents.length} events`);

      try {
        // Generate combined ICS
        console.log('Generating combined ICS file...');
        icsContent = generateICS(validation.validatedEvents, config.ics);
        console.log('Combined ICS generated successfully');

        // Generate individual ICS files if requested
        if (config.ics?.method === 'REQUEST') {
          console.log('Generating individual ICS files...');
          individualICS = new Map();
          for (const event of validation.validatedEvents) {
            const eventICS = generateSingleEventICS(event, config.ics);
            individualICS.set(event.title, eventICS);
          }
          console.log(`Generated ${individualICS.size} individual ICS files`);
        }
      } catch (icsError: any) {
        console.error('ICS generation error:', icsError);
        throw icsError;
      }
    } else {
      console.warn('No valid events to generate ICS for');
    }

    const processingTime = Date.now() - startTime;

    return {
      events: validation.validatedEvents,
      icsContent,
      individualICS,
      metadata: {
        totalEvents: events.length,
        processedEvents: validation.validatedEvents.length,
        failedEvents: validation.invalidEvents.length,
        processingTime,
        warnings,
      },
    };
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(`Scraping failed: ${error}`, ErrorCode.INTERNAL_ERROR, { error }, false);
  }
}

/**
 * Extract events from processed content
 */
async function extractEventsFromContent(
  processedContent: any,
  source: SourceConfiguration,
  processing: ProcessingOptions,
  client: Anthropic
): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = [];

  // FIXME: This is adding a nonsensical event w/ entire JSON
  // First, add any structured data events
  // if (processedContent.structuredData.length > 0) {
  //   console.log(`Found ${processedContent.structuredData.length} events from structured data`);

  //   for (const structured of processedContent.structuredData) {
  //     if (structured.title && structured.datetime) {
  //       try {
  //         const event: CalendarEvent = {
  //           title: structured.title,
  //           startTime: new Date(structured.datetime),
  //           endTime: new Date(structured.datetime),
  //           location: structured.location || 'TBD',
  //           description: structured.description || '',
  //           timezone: processing.timezone.default
  //         };

  //         // Add 2 hours to end time if not specified
  //         event.endTime.setHours(event.endTime.getHours() + 2);

  //         allEvents.push(event);
  //       } catch (error) {
  //         console.error('Failed to parse structured event:', error);
  //       }
  //     }
  //   }
  // }

  // Then, use AI for remaining content
  if (processedContent.chunks.length > 0) {
    const context: ExtractionContext = {
      sourceUrl: source.url,
      timezoneHint: processing.timezone.default,
      currentDate: new Date(),
      language: processedContent.metadata.language,
    };

    // Extract from high-priority chunks
    const highPriorityChunks = processedContent.chunks
      .filter((c: any) => c.priority >= 5)
      .map((c: any) => c.content);

    if (highPriorityChunks.length > 0) {
      console.log(`Processing ${highPriorityChunks.length} high-priority content chunks`);

      const aiEvents = await batchExtractEvents(
        client,
        highPriorityChunks,
        context,
        processing.ai,
        { concurrency: processing.batchSize }
      );

      allEvents.push(...aiEvents);
    }
  }

  // Deduplicate events
  const uniqueEvents = deduplicateEvents(allEvents);

  return uniqueEvents;
}

/**
 * Deduplicate events based on title and start time
 */
function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const unique: CalendarEvent[] = [];

  for (const event of events) {
    const key = `${event.title.toLowerCase()}-${event.startTime.toISOString()}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(event);
    }
  }

  return unique;
}

/**
 * Monitor scraping operation
 */
export async function monitoredScrape(
  config: ScraperConfig,
  onProgress: ((message: string) => void) | undefined,
  anthropicClient: Anthropic
): Promise<ScraperResult> {
  const notify = (msg: string) => {
    console.log(msg);
    onProgress?.(msg);
  };

  notify('Starting scrape operation');

  try {
    notify(`Fetching ${config.source.url}`);
    const result = await scrapeEvents(config, anthropicClient);

    notify(`Successfully extracted ${result.events.length} events`);

    if (result.metadata.warnings.length > 0) {
      notify(`Warnings: ${result.metadata.warnings.join(', ')}`);
    }

    return result;
  } catch (error) {
    notify(`Error: ${error}`);
    throw error;
  }
}

// validateConfig is now in utils/config.ts

/**
 * Create scraper config from environment variables
 * (used on CRON)
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
      batchSize: parseInt(process.env.BATCH_SIZE || '5', 10),
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
        model: 'claude-3-haiku-20240307',
      },
    },
    ics: {
      calendarName: process.env.CALENDAR_NAME || 'Scraped Events',
      timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
      includeAlarms: process.env.INCLUDE_ALARMS !== 'false',
    },
  };
}
