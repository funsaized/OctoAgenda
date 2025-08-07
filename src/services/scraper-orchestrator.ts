/**
 * Scraper Orchestrator Service
 * Coordinates all services to extract events and generate ICS files
 */

import { 
  CalendarEvent,
  ProcessingOptions,
  SourceConfiguration,
  ScraperError,
  ErrorCode,
  Result,
  ICSOptions
} from '../types/index.js';
import { fetchHTML } from './html-fetcher.js';
import { preprocessHTML, hasEventContent } from './content-preprocessor.js';
import { validateExtraction, batchExtractEvents, ExtractionContext } from './anthropic-ai.js';
import { generateICS, generateSingleEventICS } from './ics-generator.js';

/**
 * Scraper configuration
 */
export interface ScraperConfig {
  source: SourceConfiguration;
  processing?: Partial<ProcessingOptions>;
  ics?: Partial<ICSOptions>;
}

/**
 * Scraper result
 */
export interface ScraperResult {
  /** Extracted events */
  events: CalendarEvent[];
  
  /** Generated ICS content */
  icsContent?: string;
  
  /** Individual ICS files for each event */
  individualICS?: Map<string, string>;
  
  /** Extraction metadata */
  metadata: {
    /** Total events found */
    totalEvents: number;
    
    /** Successfully processed events */
    processedEvents: number;
    
    /** Failed events */
    failedEvents: number;
    
    /** Processing time in ms */
    processingTime: number;
    
    /** AI token usage */
    tokenUsage?: {
      input: number;
      output: number;
      estimatedCost: number;
    };
    
    /** Warnings */
    warnings: string[];
  };
}

/**
 * Default processing options
 */
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  batchSize: 5,
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  cache: {
    enabled: true,
    ttl: 3600
  },
  timezone: {
    default: 'America/New_York',
    autoDetect: true
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-3-haiku-20240307'
  }
};

/**
 * Main scraper function
 */
export async function scrapeEvents(config: ScraperConfig): Promise<ScraperResult> {
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
      useCache: processing.cache.enabled
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
    console.log('Preprocessing HTML content');
    const processedContent = preprocessHTML(html);
    
    if (!hasEventContent(processedContent)) {
      warnings.push('No event content detected in HTML');
    }
    
    // Step 3: Extract events using AI
    console.log('Extracting events with AI');
    const events = await extractEventsFromContent(
      processedContent,
      config.source,
      processing
    );
    
    // Step 4: Validate extracted events
    const validation = validateExtraction(events);
    if (!validation.valid) {
      warnings.push(...validation.errors.map(e => e.message));
    }
    
    // Step 5: Generate ICS files
    let icsContent: string | undefined;
    let individualICS: Map<string, string> | undefined;
    
    if (validation.validatedEvents.length > 0) {
      console.log('Generating ICS files');
      
      // Generate combined ICS
      icsContent = generateICS(validation.validatedEvents, config.ics);
      
      // Generate individual ICS files if requested
      if (config.ics?.method === 'REQUEST') {
        individualICS = new Map();
        for (const event of validation.validatedEvents) {
          const eventICS = generateSingleEventICS(event, config.ics);
          individualICS.set(event.title, eventICS);
        }
      }
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
        warnings
      }
    };
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }
    
    throw new ScraperError(
      `Scraping failed: ${error}`,
      ErrorCode.INTERNAL_ERROR,
      { error },
      false
    );
  }
}

/**
 * Extract events from processed content
 */
async function extractEventsFromContent(
  processedContent: any,
  source: SourceConfiguration,
  processing: ProcessingOptions
): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = [];
  
  // First, add any structured data events
  if (processedContent.structuredData.length > 0) {
    console.log(`Found ${processedContent.structuredData.length} events from structured data`);
    
    for (const structured of processedContent.structuredData) {
      if (structured.title && structured.datetime) {
        try {
          const event: CalendarEvent = {
            title: structured.title,
            startTime: new Date(structured.datetime),
            endTime: new Date(structured.datetime),
            location: structured.location || 'TBD',
            description: structured.description || '',
            timezone: processing.timezone.default
          };
          
          // Add 2 hours to end time if not specified
          event.endTime.setHours(event.endTime.getHours() + 2);
          
          allEvents.push(event);
        } catch (error) {
          console.error('Failed to parse structured event:', error);
        }
      }
    }
  }
  
  // Then, use AI for remaining content
  if (processedContent.chunks.length > 0) {
    const context: ExtractionContext = {
      sourceUrl: source.url,
      timezoneHint: processing.timezone.default,
      currentDate: new Date(),
      language: processedContent.metadata.language
    };
    
    // Extract from high-priority chunks
    const highPriorityChunks = processedContent.chunks
      .filter((c: any) => c.priority >= 5)
      .map((c: any) => c.content);
    
    if (highPriorityChunks.length > 0) {
      console.log(`Processing ${highPriorityChunks.length} high-priority content chunks`);
      
      const aiEvents = await batchExtractEvents(
        highPriorityChunks,
        context,
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
 * Scrape multiple sources
 */
export async function scrapeMultipleSources(
  configs: ScraperConfig[]
): Promise<Result<ScraperResult>[]> {
  const results: Result<ScraperResult>[] = [];
  
  for (const config of configs) {
    try {
      const result = await scrapeEvents(config);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof ScraperError ? error :
          new ScraperError(
            `Unknown error: ${error}`,
            ErrorCode.INTERNAL_ERROR,
            { error },
            false
          )
      });
    }
  }
  
  return results;
}

/**
 * Monitor scraping operation
 */
export async function monitoredScrape(
  config: ScraperConfig,
  onProgress?: (message: string) => void
): Promise<ScraperResult> {
  const notify = (msg: string) => {
    console.log(msg);
    onProgress?.(msg);
  };
  
  notify('Starting scrape operation');
  
  try {
    notify(`Fetching ${config.source.url}`);
    const result = await scrapeEvents(config);
    
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

/**
 * Validate scraper configuration
 */
export function validateConfig(config: ScraperConfig): string[] {
  const errors: string[] = [];
  
  // Validate source
  if (!config.source.url) {
    errors.push('Source URL is required');
  } else {
    try {
      new URL(config.source.url);
    } catch {
      errors.push('Invalid source URL');
    }
  }
  
  // Validate processing options
  if (config.processing) {
    if (!config.processing.ai?.apiKey && !process.env.ANTHROPIC_API_KEY) {
      errors.push('Anthropic API key is required');
    }
    
    if (config.processing.batchSize && config.processing.batchSize < 1) {
      errors.push('Batch size must be at least 1');
    }
  }
  
  return errors;
}

/**
 * Create scraper config from environment variables
 */
export function createConfigFromEnv(): ScraperConfig {
  return {
    source: {
      url: process.env.SOURCE_URL || '',
      userAgent: process.env.SOURCE_USER_AGENT,
      selectors: process.env.SOURCE_SELECTOR ? {
        eventContainer: process.env.SOURCE_SELECTOR
      } : undefined
    },
    processing: {
      batchSize: parseInt(process.env.BATCH_SIZE || '5', 10),
      retry: {
        maxAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.CACHE_TTL || '3600', 10)
      },
      timezone: {
        default: process.env.DEFAULT_TIMEZONE || 'America/New_York',
        autoDetect: process.env.DETECT_TIMEZONE !== 'false'
      },
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-haiku-20240307'
      }
    },
    ics: {
      calendarName: process.env.CALENDAR_NAME || 'Scraped Events',
      timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
      includeAlarms: process.env.INCLUDE_ALARMS !== 'false'
    }
  };
}