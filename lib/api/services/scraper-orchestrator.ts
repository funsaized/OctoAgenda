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
import { enhancedPreprocessHTML, EnhancedProcessedContent } from '@/lib/api/services/enhanced-content-processor';
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

    // Step 2: Enhanced HTML Preprocessing
    console.log('Starting enhanced HTML preprocessing');
    let processedContent: EnhancedProcessedContent;
    
    try {
      processedContent = await enhancedPreprocessHTML(html);
      
      console.log(`✅ Enhanced preprocessing completed:`);
      console.log(`  - Token reduction: ${(processedContent.metadata.tokenReduction * 100).toFixed(1)}%`);
      console.log(`  - Quality score: ${(processedContent.qualityMetrics.overallQuality * 100).toFixed(1)}%`);
      console.log(`  - Event content ratio: ${(processedContent.qualityMetrics.eventContentRatio * 100).toFixed(1)}%`);
      console.log(`  - High-priority chunks: ${processedContent.prioritizedChunks.length}`);
      
      // Quality checks
      if (processedContent.qualityMetrics.overallQuality < 0.3) {
        warnings.push('Low content quality detected - may affect extraction accuracy');
      }
      
      if (processedContent.qualityMetrics.eventContentRatio < 0.1) {
        warnings.push('Very little event content detected in HTML');
      }
      
      if (processedContent.prioritizedChunks.length === 0) {
        throw new ScraperError(
          'No relevant content chunks found after processing',
          ErrorCode.INVALID_HTML,
          { 
            url: config.source.url,
            qualityMetrics: processedContent.qualityMetrics 
          },
          false
        );
      }
      
    } catch (error: any) {
      console.error('\n❌ ENHANCED PREPROCESSING FAILED');
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines
      });
      
      if (error.details) {
        console.error('Additional context:', error.details);
      }
      
      console.log('\n🔄 FALLING BACK TO BASIC PROCESSING...');
      
      // Fallback to original processor
      const basicProcessedContent = preprocessHTML(html);
      warnings.push(`Enhanced processing failed (${error.message}), using basic processing mode`);
      
      // Convert to enhanced format for compatibility
      processedContent = {
        optimizedContent: basicProcessedContent.cleanedText,
        prioritizedChunks: basicProcessedContent.chunks.map((chunk, index) => ({
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          relevanceScore: chunk.priority / 10,
          eventScore: chunk.priority / 10,
          contentType: chunk.context as any,
          entities: {
            dates: [],
            locations: [],
            organizations: [],
            keywords: [],
          },
          sourceContext: {
            htmlTag: 'div',
            cssClasses: [],
            isMainContent: true,
            semanticRole: 'content',
          },
        })),
        structuredEvents: basicProcessedContent.structuredData.map(event => ({
          ...event,
          source: event.source === 'regex' ? 'semantic-analysis' as const : event.source,
          confidence: 0.7,
        })),
        qualityMetrics: {
          overallQuality: 0.5,
          informationDensity: 0.5,
          eventContentRatio: 0.5,
          temporalRichness: 0.3,
          locationRichness: 0.3,
          structureScore: 0.4,
          boilerplateRatio: 0.5,
        },
        metadata: {
          originalLength: html.length,
          processedLength: basicProcessedContent.cleanedText.length,
          tokenReduction: 0.2,
          chunkCount: basicProcessedContent.chunks.length,
          language: basicProcessedContent.metadata.language || 'en',
          title: basicProcessedContent.metadata.title,
          description: basicProcessedContent.metadata.description,
          contentAreas: {
            main: false,
            article: false,
            navigation: false,
            sidebar: false,
            footer: false,
          },
          processingStats: {
            htmlAnalysisTime: 0,
            contentExtractionTime: 0,
            chunkingTime: 0,
            qualityAssessmentTime: 0,
          },
        },
      };
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
        // Enhanced metadata from new processor
        tokenUsage: {
          input: 0, // Will be updated by AI service
          output: 0, // Will be updated by AI service
          estimatedCost: 0, // Will be updated by AI service
        },
        enhancedProcessing: {
          tokenReduction: processedContent.metadata.tokenReduction,
          qualityScore: processedContent.qualityMetrics.overallQuality,
          eventContentRatio: processedContent.qualityMetrics.eventContentRatio,
          structuredEventsFound: processedContent.structuredEvents.length,
          chunksProcessed: processedContent.prioritizedChunks.length,
          processingStats: processedContent.metadata.processingStats,
        },
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
 * Extract events from enhanced processed content
 */
async function extractEventsFromContent(
  processedContent: EnhancedProcessedContent,
  source: SourceConfiguration,
  processing: ProcessingOptions,
  client: Anthropic
): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = [];

  // First, process structured data events with improved parsing
  if (processedContent.structuredEvents.length > 0) {
    console.log(`Found ${processedContent.structuredEvents.length} structured events`);

    for (const structured of processedContent.structuredEvents) {
      if (structured.title && structured.startDate) {
        try {
          const startTime = new Date(structured.startDate);
          const endTime = structured.endDate ? new Date(structured.endDate) : new Date(startTime);
          
          // If no end date provided, add 2 hours
          if (!structured.endDate) {
            endTime.setHours(endTime.getHours() + 2);
          }

          const event: CalendarEvent = {
            title: structured.title,
            startTime,
            endTime,
            location: structured.location || 'TBD',
            description: structured.description || '',
            timezone: processing.timezone.default,
            organizer: structured.organizer ? { name: structured.organizer } : undefined,
            url: structured.url,
            categories: structured.category ? [structured.category] : undefined,
          };

          allEvents.push(event);
          console.log(`  ✅ Structured event: "${event.title}" (confidence: ${structured.confidence.toFixed(2)})`);
        } catch (error) {
          console.error(`  ❌ Failed to parse structured event "${structured.title}":`, error);
        }
      }
    }
  }

  // Then, use AI for high-priority content chunks
  if (processedContent.prioritizedChunks.length > 0) {
    const context: ExtractionContext = {
      sourceUrl: source.url,
      timezoneHint: processing.timezone.default,
      currentDate: new Date(),
      language: processedContent.metadata.language || 'en',
    };

    // Filter chunks with high event likelihood or relevance
    const highValueChunks = processedContent.prioritizedChunks
      .filter(chunk => chunk.eventScore > 0.3 || chunk.relevanceScore > 0.5)
      .slice(0, 15) // Limit to top 15 chunks to control token usage
      .map(chunk => chunk.content);

    if (highValueChunks.length > 0) {
      console.log(`Processing ${highValueChunks.length} high-value content chunks for AI extraction`);
      
      // Log chunk quality info
      const avgEventScore = processedContent.prioritizedChunks
        .slice(0, highValueChunks.length)
        .reduce((sum, chunk) => sum + chunk.eventScore, 0) / highValueChunks.length;
      console.log(`  Average event score: ${(avgEventScore * 100).toFixed(1)}%`);

      try {
        const aiEvents = await batchExtractEvents(
          client,
          highValueChunks,
          context,
          processing.ai,
          { concurrency: Math.min(processing.batchSize, 3) } // Limit concurrency for better reliability
        );

        allEvents.push(...aiEvents);
        console.log(`  ✅ AI extracted ${aiEvents.length} events from ${highValueChunks.length} chunks`);
      } catch (aiError: any) {
        console.error('  ❌ AI extraction failed:', aiError.message);
        throw new ScraperError(
          `AI event extraction failed: ${aiError.message}`,
          ErrorCode.AI_API_ERROR,
          { 
            url: source.url,
            chunks: highValueChunks.length,
            qualityMetrics: processedContent.qualityMetrics
          },
          true
        );
      }
    } else {
      console.warn('No high-value content chunks found for AI extraction');
    }
  }

  // Enhanced deduplication with better matching
  const uniqueEvents = enhancedDeduplicateEvents(allEvents);
  console.log(`Final event count after deduplication: ${uniqueEvents.length}`);

  return uniqueEvents;
}

/**
 * Enhanced deduplication with fuzzy matching
 */
function enhancedDeduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const unique: CalendarEvent[] = [];

  for (const event of events) {
    let isDuplicate = false;

    for (const existingEvent of unique) {
      if (isEventDuplicate(event, existingEvent)) {
        isDuplicate = true;
        
        // Keep the event with more complete information
        if (getEventCompleteness(event) > getEventCompleteness(existingEvent)) {
          const index = unique.indexOf(existingEvent);
          unique[index] = event;
        }
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(event);
    }
  }

  return unique;
}

/**
 * Check if two events are duplicates using fuzzy matching
 */
function isEventDuplicate(event1: CalendarEvent, event2: CalendarEvent): boolean {
  // Exact title and time match
  if (
    event1.title.toLowerCase() === event2.title.toLowerCase() &&
    Math.abs(event1.startTime.getTime() - event2.startTime.getTime()) < 60000 // Within 1 minute
  ) {
    return true;
  }

  // Similar title with same date
  const titleSimilarity = calculateStringSimilarity(
    event1.title.toLowerCase(),
    event2.title.toLowerCase()
  );
  
  const sameDate = 
    event1.startTime.toDateString() === event2.startTime.toDateString();

  if (titleSimilarity > 0.8 && sameDate) {
    return true;
  }

  return false;
}

/**
 * Calculate string similarity using simple edit distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLength;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate event completeness score
 */
function getEventCompleteness(event: CalendarEvent): number {
  let score = 0;
  
  if (event.title?.trim()) score += 2;
  if (event.description?.trim()) score += 1;
  if (event.location?.trim() && event.location !== 'TBD') score += 1;
  if (event.organizer?.name?.trim()) score += 1;
  if (event.url?.trim()) score += 1;
  if (event.categories?.length) score += 1;
  
  return score;
}

/**
 * Legacy deduplication function for backward compatibility
 */
function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  return enhancedDeduplicateEvents(events);
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
