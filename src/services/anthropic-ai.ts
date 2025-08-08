/**
 * Anthropic AI Integration Service
 * Uses Claude 3 Haiku for event extraction from HTML content
 */

import Anthropic from '@anthropic-ai/sdk';
import { 
  CalendarEvent, 
  ExtractedEventData, 
  ScraperError, 
  ErrorCode,
  AIConfiguration 
} from '../types/index.js';
import { z } from 'zod';

/**
 * Extraction context for AI processing
 */
export interface ExtractionContext {
  /** Source URL for context */
  sourceUrl?: string;
  
  /** Detected timezone hint */
  timezoneHint?: string;
  
  /** Current date for relative date resolution */
  currentDate?: Date;
  
  /** Language hint */
  language?: string;
  
  /** Additional context */
  additionalContext?: string;
}

/**
 * Validation result for extracted events
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** Validation errors */
  errors: ValidationError[];
  
  /** Validated events */
  validatedEvents: CalendarEvent[];
  
  /** Events that failed validation */
  invalidEvents: any[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Event index */
  eventIndex: number;
  
  /** Field with error */
  field: string;
  
  /** Error message */
  message: string;
  
  /** Invalid value */
  value?: any;
}

/**
 * AI-extracted event schema for validation
 */
const ExtractedEventSchema = z.object({
  title: z.string().min(1),
  startDateTime: z.string(),
  endDateTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  organizer: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional()
  }).optional(),
  timezone: z.string().optional(),
  recurringRule: z.string().optional()
});

type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

const ExtractedEventsResponseSchema = z.object({
  events: z.array(ExtractedEventSchema),
  detectedTimezone: z.string().optional(),
  warnings: z.array(z.string()).optional()
});

/**
 * System prompt for event extraction
 */
const SYSTEM_PROMPT = `You are an expert at extracting calendar event information from HTML content. 
Extract all events and return them as a JSON object with an "events" array.
Each event should have these fields:
- title: event name (required)
- startDateTime: ISO 8601 format with timezone if known (required)
- endDateTime: ISO 8601 format or calculate from duration
- location: physical address, venue name, or "Online"/"Virtual" for online events
- description: brief summary of the event
- organizer: object with name, email, phone if available
- timezone: detected timezone or "UNKNOWN"
- recurringRule: RRULE format if it's a recurring event

Additionally, return:
- detectedTimezone: the most likely timezone for all events
- warnings: array of any issues or ambiguities found

Important guidelines:
- Parse relative dates (tomorrow, next Friday) based on the current date if provided
- Detect timezone from context clues (city names, timezone abbreviations)
- If timezone is ambiguous, use "UNKNOWN" and add a warning
- Handle various date formats and convert to ISO 8601
- Extract recurring patterns if mentioned (e.g., "every Tuesday")
- Be conservative - only extract clear event information`;

/**
 * Anthropic client instance
 */
let anthropicClient: Anthropic | null = null;

/**
 * Initialize Anthropic client
 */
export function initializeAnthropic(config: AIConfiguration): void {
  anthropicClient = new Anthropic({
    apiKey: config.apiKey,
  });
}

/**
 * Get or create Anthropic client
 */
function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ScraperError(
        'Anthropic API key not configured',
        ErrorCode.CONFIGURATION_ERROR,
        { message: 'ANTHROPIC_API_KEY environment variable not set' },
        false
      );
    }
    initializeAnthropic({ apiKey, model: 'claude-3-haiku-20240307' });
  }
  return anthropicClient!;
}

/**
 * Extract events from content using Claude AI
 */
export async function extractEvents(
  content: string,
  context?: ExtractionContext
): Promise<CalendarEvent[]> {
  const client = getClient();
  
  // Build the user prompt
  const userPrompt = buildUserPrompt(content, context);
  
  try {
    // Start with the initial request
    let allEvents: CalendarEvent[] = [];
    let extractedEventTitles = new Set<string>(); // Track events we've already seen
    let conversationMessages = [
      {
        role: 'user' as const,
        content: userPrompt
      }
    ];
    
    let continuationCount = 0;
    const maxContinuations = 5; // Prevent infinite loops
    
    while (continuationCount < maxContinuations) {
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096, // Maximum allowed for Haiku
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: conversationMessages
      });
      
      // Extract text from response
      const responseText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');
      
      console.log(`AI Response (attempt ${continuationCount + 1}):`, responseText.substring(0, 500));
      console.log(`Token usage - Input: ${response.usage?.input_tokens}, Output: ${response.usage?.output_tokens}`);
      
      // Check if response was truncated (hit token limit)
      const wasTruncated = response.usage?.output_tokens === 4096 || isResponseTruncated(responseText);
      
      try {
        // Try to parse the response as-is first
        const extractedData = parseAIResponse(responseText);
        const events = convertToCalendarEvents(extractedData, context);
        
        // Filter out events we've already seen
        const newEvents = events.filter(event => {
          const eventKey = event.title.toLowerCase().trim();
          if (extractedEventTitles.has(eventKey)) {
            return false; // Skip duplicates
          }
          extractedEventTitles.add(eventKey);
          return true;
        });
        
        allEvents.push(...newEvents);
        console.log(`Extracted ${events.length} total events, ${newEvents.length} new events from response ${continuationCount + 1}`);
        
        // If not truncated and we got some new events, we're done
        if (!wasTruncated) {
          break;
        }
        
        // If we didn't get any new events, stop trying
        if (newEvents.length === 0 && continuationCount > 0) {
          console.log('No new events found, stopping continuation');
          break;
        }
        
      } catch (parseError) {
        // If parsing failed and we suspect truncation, try to continue
        if (wasTruncated) {
          console.log('Response appears truncated, attempting continuation...');
        } else {
          // If not truncated but still failed to parse, re-throw the error
          throw parseError;
        }
      }
      
      // Build list of events we've already extracted
      const alreadyExtracted = Array.from(extractedEventTitles);
      const skipList = alreadyExtracted.length > 0 ? 
        `\n\nDo NOT include these events that were already extracted: ${alreadyExtracted.slice(0, 10).join(', ')}${alreadyExtracted.length > 10 ? ' and others' : ''}` : '';
      
      // Ask for continuation with context of previous response
      conversationMessages.push({
        role: 'user' as const,
        content: `The previous response was truncated. Please continue with a new complete JSON response containing ONLY the remaining events that were not yet extracted.${skipList}\n\nProvide a complete JSON object with the events array containing only new/remaining events.`
      });
      
      continuationCount++;
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (continuationCount >= maxContinuations) {
      console.warn('Reached maximum continuation attempts');
    }
    
    // Deduplicate events in case there are overlaps between responses
    const uniqueEvents = deduplicateEvents(allEvents);
    console.log(`Total events after ${continuationCount + 1} requests: ${allEvents.length}, unique: ${uniqueEvents.length}`);
    
    return uniqueEvents;
    
  } catch (error: any) {
    if (error.status === 429) {
      throw new ScraperError(
        'Anthropic API rate limit exceeded',
        ErrorCode.AI_RATE_LIMIT,
        { error: error.message },
        true
      );
    }
    
    if (error.status >= 500) {
      throw new ScraperError(
        'Anthropic API server error',
        ErrorCode.AI_API_ERROR,
        { error: error.message },
        true
      );
    }
    
    throw new ScraperError(
      `Failed to extract events: ${error.message}`,
      ErrorCode.AI_API_ERROR,
      { error: error.message },
      false
    );
  }
}

/**
 * Build user prompt with content and context
 */
function buildUserPrompt(content: string, context?: ExtractionContext): string {
  let prompt = `Current date: ${context?.currentDate?.toISOString() || new Date().toISOString()}\n`;
  
  if (context?.sourceUrl) {
    prompt += `Source URL: ${context.sourceUrl}\n`;
  }
  
  if (context?.timezoneHint) {
    prompt += `Timezone hint: ${context.timezoneHint}\n`;
  }
  
  if (context?.language) {
    prompt += `Language: ${context.language}\n`;
  }
  
  if (context?.additionalContext) {
    prompt += `Additional context: ${context.additionalContext}\n`;
  }
  
  prompt += `\n---HTML CONTENT---\n${content}\n---END CONTENT---\n\n`;
  prompt += 'Extract all events from the above content and return as JSON.';
  
  return prompt;
}

/**
 * Parse AI response to structured data
 */
function parseAIResponse(responseText: string): ExtractedEventData {
  try {
    // Find JSON in the response (AI might include explanation text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to find JSON in response:', responseText);
      throw new Error('No JSON found in response');
    }
    
    const jsonStr = jsonMatch[0];
    console.log('Attempting to parse JSON:', jsonStr.substring(0, 300));
    const parsed = JSON.parse(jsonStr);
    
    // Validate with schema
    const validated = ExtractedEventsResponseSchema.parse(parsed);
    
    return {
      events: validated.events as any[], // Raw events from AI
      confidence: 0.8, // Default confidence for successful extraction
      warnings: validated.warnings,
      detectedTimezone: validated.detectedTimezone,
      metadata: {
        totalFound: validated.events.length,
        successfullyParsed: validated.events.length,
        extractedAt: new Date()
      }
    };
  } catch (error: any) {
    throw new ScraperError(
      'Failed to parse AI response',
      ErrorCode.AI_INVALID_RESPONSE,
      { responseText, error: error.message },
      false
    );
  }
}

/**
 * Convert extracted data to CalendarEvent format
 */
function convertToCalendarEvents(
  extractedData: ExtractedEventData,
  context?: ExtractionContext
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  for (const extracted of (extractedData.events as any[]) as ExtractedEvent[]) {
    try {
      const event: CalendarEvent = {
        title: extracted.title,
        startTime: parseDateTime(extracted.startDateTime, context),
        endTime: extracted.endDateTime ? 
          parseDateTime(extracted.endDateTime, context) : 
          addDefaultDuration(parseDateTime(extracted.startDateTime, context)),
        location: extracted.location || 'TBD',
        description: extracted.description || '',
        timezone: extracted.timezone || 
                 extractedData.detectedTimezone || 
                 context?.timezoneHint || 
                 'America/New_York',
        organizer: extracted.organizer,
        recurringRule: extracted.recurringRule
      };
      
      events.push(event);
    } catch (error) {
      console.error(`Failed to convert event: ${error}`);
      // Continue with other events
    }
  }
  
  return events;
}

/**
 * Parse datetime string to Date object
 */
function parseDateTime(dateTimeStr: string, context?: ExtractionContext): Date {
  try {
    // Try parsing as ISO 8601
    const date = new Date(dateTimeStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch {}
  
  // Handle relative dates if we have context
  if (context?.currentDate) {
    const lower = dateTimeStr.toLowerCase();
    const current = new Date(context.currentDate);
    
    if (lower === 'today') {
      return current;
    }
    
    if (lower === 'tomorrow') {
      const tomorrow = new Date(current);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Add more relative date handling as needed
  }
  
  // Fallback to current date/time
  console.warn(`Could not parse date: ${dateTimeStr}, using current time`);
  return new Date();
}

/**
 * Add default duration to a date (2 hours)
 */
function addDefaultDuration(date: Date): Date {
  const endDate = new Date(date);
  endDate.setHours(endDate.getHours() + 2);
  return endDate;
}

/**
 * Check if a response appears to be truncated
 */
function isResponseTruncated(responseText: string): boolean {
  // Look for signs of truncation in JSON
  const signs = [
    !responseText.trim().endsWith('}'),           // JSON doesn't end properly
    responseText.includes('"tit'),               // Cut off in the middle of "title"
    responseText.includes('"start'),             // Cut off in the middle of "startDateTime"
    responseText.includes('"loc'),               // Cut off in the middle of "location"
    /,\s*$/.test(responseText.trim()),           // Ends with a comma
    /"[^"]*$/.test(responseText.trim()),         // Ends with an unclosed quote
  ];
  
  return signs.some(sign => sign);
}

/**
 * Deduplicate events based on title and start time
 */
function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const uniqueEvents = new Map<string, CalendarEvent>();
  
  for (const event of events) {
    // Create a unique key based on title and start time
    const normalizedTitle = event.title.toLowerCase().trim();
    const startTime = event.startTime.toISOString();
    const key = `${normalizedTitle}-${startTime}`;
    
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    } else {
      // If we have a duplicate, keep the one with more complete information
      const existing = uniqueEvents.get(key)!;
      const hasMoreInfo = (event.description?.length || 0) > (existing.description?.length || 0) ||
                         (event.location !== 'TBD' && existing.location === 'TBD') ||
                         (event.organizer && !existing.organizer);
      
      if (hasMoreInfo) {
        uniqueEvents.set(key, event);
      }
    }
  }
  
  return Array.from(uniqueEvents.values()).sort((a, b) => 
    a.startTime.getTime() - b.startTime.getTime()
  );
}

/**
 * Estimate API cost for content
 */
export function estimateCost(content: string): number {
  // Rough estimation based on Haiku pricing
  // Input: $0.25 per million tokens
  // Output: $1.25 per million tokens
  
  const estimatedInputTokens = Math.ceil(content.length / 4);
  const estimatedOutputTokens = 500; // Estimate for Haiku responses
  
  const inputCost = (estimatedInputTokens / 1_000_000) * 0.25;
  const outputCost = (estimatedOutputTokens / 1_000_000) * 1.25;
  
  return inputCost + outputCost;
}

/**
 * Validate extracted events
 */
export function validateExtraction(events: any[]): ValidationResult {
  const errors: ValidationError[] = [];
  const validatedEvents: CalendarEvent[] = [];
  const invalidEvents: any[] = [];
  
  events.forEach((event, index) => {
    const eventErrors: ValidationError[] = [];
    
    // Check required fields
    if (!event.title || event.title.trim().length === 0) {
      eventErrors.push({
        eventIndex: index,
        field: 'title',
        message: 'Title is required',
        value: event.title
      });
    }
    
    if (!event.startTime && !event.startDateTime) {
      eventErrors.push({
        eventIndex: index,
        field: 'startTime',
        message: 'Start time is required',
        value: event.startTime
      });
    }
    
    // Validate dates
    if (event.startTime || event.startDateTime) {
      const startDate = new Date(event.startTime || event.startDateTime);
      if (isNaN(startDate.getTime())) {
        eventErrors.push({
          eventIndex: index,
          field: 'startTime',
          message: 'Invalid start time format',
          value: event.startTime || event.startDateTime
        });
      }
    }
    
    if (event.endTime || event.endDateTime) {
      const endDate = new Date(event.endTime || event.endDateTime);
      if (isNaN(endDate.getTime())) {
        eventErrors.push({
          eventIndex: index,
          field: 'endTime',
          message: 'Invalid end time format',
          value: event.endTime || event.endDateTime
        });
      }
    }
    
    // Check if end time is after start time
    if (event.startTime && event.endTime) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      if (end <= start) {
        eventErrors.push({
          eventIndex: index,
          field: 'endTime',
          message: 'End time must be after start time',
          value: event.endTime
        });
      }
    }
    
    if (eventErrors.length === 0) {
      validatedEvents.push(event as CalendarEvent);
    } else {
      invalidEvents.push(event);
      errors.push(...eventErrors);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    validatedEvents,
    invalidEvents
  };
}

/**
 * Batch process multiple content chunks
 */
export async function batchExtractEvents(
  contentChunks: string[],
  context?: ExtractionContext,
  options?: { concurrency?: number }
): Promise<CalendarEvent[]> {
  const concurrency = options?.concurrency || 3;
  const allEvents: CalendarEvent[] = [];
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < contentChunks.length; i += concurrency) {
    const batch = contentChunks.slice(i, i + concurrency);
    const batchPromises = batch.map(chunk => 
      extractEvents(chunk, context).catch(err => {
        console.error(`Failed to extract from chunk: ${err}`);
        return [];
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(events => allEvents.push(...events));
    
    // Add delay between batches to avoid rate limiting
    if (i + concurrency < contentChunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Deduplicate events based on title and start time
  const uniqueEvents = new Map<string, CalendarEvent>();
  for (const event of allEvents) {
    const key = `${event.title}-${event.startTime.toISOString()}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  
  return Array.from(uniqueEvents.values());
}