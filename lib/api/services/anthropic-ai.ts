/**
 * Anthropic AI Integration Service
 * Uses Claude 3 Haiku for event extraction from HTML content
 */

import Anthropic from '@anthropic-ai/sdk';
import { CalendarEvent, ScraperError, ErrorCode, AIConfiguration } from '@/lib/api/types/index';
import { parse as parsePartialJSON, Allow } from 'partial-json';

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
 * System prompt for event extraction
 */
const SYSTEM_PROMPT = `You are an expert at extracting calendar event information from HTML content.
Extract all events and return them as a JSON object with an "events" array.
Each event should have these fields:
- title: event name (required)
- startDateTime: LOCAL time in ISO 8601 format WITHOUT timezone suffix (required)
- endDateTime: LOCAL time in ISO 8601 format WITHOUT timezone suffix
- location: physical address, venue name, or "Online"/"Virtual" for online events
- description: brief summary of the event
- organizer: object with name, email, phone if available
- timezone: IANA timezone identifier (e.g., "America/Chicago", "America/New_York")
- recurringRule: RRULE format if it's a recurring event

Additionally, return:
- detectedTimezone: the most likely timezone for all events
- warnings: array of any issues or ambiguities found

CRITICAL TIMEZONE RULES:
- For times like "6PM CT" or "6PM Central", output startDateTime as "2025-08-12T18:00:00" (WITHOUT Z or timezone offset)
- Set timezone field to "America/Chicago" for CT/Central Time
- For "6PM ET" or "6PM Eastern", set timezone to "America/New_York"
- For "6PM PT" or "6PM Pacific", set timezone to "America/Los_Angeles"
- NEVER output UTC times (no Z suffix) unless the source explicitly states UTC
- The startDateTime should represent the local time in the event's timezone

Important guidelines:
- Parse relative dates (tomorrow, next Friday) based on the current date if provided
- Detect timezone from context clues (city names, timezone abbreviations, venue locations)
- If timezone is ambiguous, use "UNKNOWN" and add a warning
- Handle various date formats but always output as local time
- Extract recurring patterns if mentioned (e.g., "every Tuesday")
- Be conservative - only extract clear event information`;

/**
 * Create Anthropic client
 * This should be called once per handler and the client passed to functions
 */
export function createAnthropicClient(config: AIConfiguration): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
  });
}

/**
 * Extract events from content using Claude AI
 */
export async function extractEvents(
  client: Anthropic,
  content: string,
  context?: ExtractionContext,
  config?: AIConfiguration
): Promise<CalendarEvent[]> {
  // Build the user prompt
  const userPrompt = buildUserPrompt(content, context);

  const allEvents: CalendarEvent[] = []; // Move outside try block for error recovery

  try {
    const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    let continuationCount = 0;
    const maxContinuations = config?.maxContinuations ?? 10;

    while (continuationCount < maxContinuations) {
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: conversationMessages,
      });

      // Extract text from response
      const responseText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n');

      console.log(
        `AI Response (attempt ${continuationCount + 1}):`,
        responseText.substring(0, 500)
      );
      console.log(
        `Token usage - Input: ${response.usage?.input_tokens}, Output: ${response.usage?.output_tokens}`
      );

      // Check if response was truncated
      const wasTruncated =
        response.usage?.output_tokens === 4096 || isResponseTruncated(responseText);

      // Add the assistant's response to maintain conversation context
      conversationMessages.push({
        role: 'assistant',
        content: responseText,
      });

      // Parse this response immediately using partial-json
      const eventsFromResponse = parsePartialJsonResponse(responseText, context);
      console.log(`=== RESPONSE ${continuationCount + 1} PROCESSING ===`);
      console.log(`Events extracted from response: ${eventsFromResponse.length}`);
      if (eventsFromResponse.length > 0) {
        console.log(`Sample events from response ${continuationCount + 1}:`);
        eventsFromResponse.slice(0, 3).forEach((event, idx) => {
          console.log(`  ${idx + 1}. "${event.title}" - ${event.startTime.toISOString()}`);
        });
        allEvents.push(...eventsFromResponse);
        console.log(`Total events accumulated so far: ${allEvents.length}`);
      } else {
        console.log(`No events extracted from response ${continuationCount + 1}`);
      }

      // If not truncated, we're done
      if (!wasTruncated) {
        break;
      }

      // Stop if we're getting non-JSON responses (model is done)
      if (!responseText.includes('{') && !responseText.includes('events')) {
        console.log('Model indicates completion');
        break;
      }

      // Simple continuation - just ask to continue
      conversationMessages.push({
        role: 'user',
        content: 'continue',
      });

      continuationCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Final aggregation and deduplication
    console.log(`\n=== FINAL PROCESSING ===`);
    console.log(`Total events collected before deduplication: ${allEvents.length}`);
    if (allEvents.length > 0) {
      console.log(`Sample of all collected events:`);
      allEvents.slice(0, 5).forEach((event, idx) => {
        console.log(
          `  ${idx + 1}. "${event.title}" - ${event.startTime.toISOString()} - ${event.location}`
        );
      });
    }

    const uniqueEvents = processAndDeduplicateEvents(allEvents);
    console.log(`Events after deduplication: ${uniqueEvents.length}`);

    if (uniqueEvents.length > 0) {
      console.log(`Sample of unique events:`);
      uniqueEvents.slice(0, 5).forEach((event, idx) => {
        console.log(
          `  ${idx + 1}. "${event.title}" - ${event.startTime.toISOString()} - ${event.location}`
        );
      });
    } else {
      console.log(`WARNING: No unique events after processing!`);
    }

    return uniqueEvents;
  } catch (error: any) {
    console.log(`\n=== ERROR OCCURRED ===`);
    console.log(`Error: ${error.message}`);
    console.log(`Events collected before error: ${allEvents.length}`);

    // If we have events, try to return them even if there was an error
    if (allEvents.length > 0) {
      console.log('Attempting to process collected events despite error...');
      try {
        const uniqueEvents = processAndDeduplicateEvents(allEvents);
        console.log(`Recovered ${uniqueEvents.length} events after error`);

        if (uniqueEvents.length > 0) {
          console.log('Returning successfully extracted events despite connection error');
          return uniqueEvents;
        }
      } catch (processingError) {
        console.log(
          'Failed to process events after error:',
          processingError instanceof Error ? processingError.message : String(processingError)
        );
      }
    }

    // Only throw the error if we have no events to return
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
 * Parse AI response using partial-json library
 */
function parsePartialJsonResponse(
  responseText: string,
  context?: ExtractionContext
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  console.log('\n=== PARSING PARTIAL JSON RESPONSE ===');
  console.log(`Response length: ${responseText.length} characters`);
  console.log(`Response preview: ${responseText.substring(0, 300)}...`);

  try {
    // Find JSON in the response (AI might include explanation text)
    const jsonMatch = responseText.match(/\{[\s\S]*$/);
    if (!jsonMatch) {
      console.log('No JSON structure found in response');
      console.log('Full response text:', responseText);
      return events;
    }

    const jsonStr = jsonMatch[0];
    console.log(`JSON extracted from response (${jsonStr.length} chars)`);
    console.log(`JSON preview: ${jsonStr.substring(0, 300)}...`);

    // Use partial-json to parse potentially incomplete JSON
    console.log('Attempting to parse with partial-json library...');
    const parsed = parsePartialJSON(jsonStr, Allow.ALL);
    console.log('Partial-json parsing successful!');
    console.log('Parsed result type:', typeof parsed);
    console.log(
      'Parsed result keys:',
      parsed && typeof parsed === 'object' ? Object.keys(parsed) : 'N/A'
    );

    // Extract events from the parsed structure
    const extractedEvents = extractEventsFromParsedJson(parsed, context);
    events.push(...extractedEvents);

    console.log(`Total events extracted from this response: ${events.length}`);
  } catch (error) {
    console.log(
      'Error in partial JSON parsing:',
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error) {
      console.log('Error stack:', error.stack);
    }
  }

  return events;
}

/**
 * Parse datetime string to Date object
 */
function parseDateTime(dateTimeStr: string, context?: ExtractionContext, timezone?: string): Date {
  try {
    // If the dateTimeStr looks like local time (no timezone info) and we have a timezone
    if (
      timezone &&
      !dateTimeStr.includes('Z') &&
      !dateTimeStr.includes('+') &&
      !dateTimeStr.includes('-', 10)
    ) {
      // This is a local time, we need to interpret it in the given timezone
      // For now, just parse it as-is and let the ICS generator handle the timezone
      // The ICS generator should use the timezone field to properly convert
      const date = new Date(dateTimeStr + 'Z'); // Temporarily treat as UTC for parsing
      if (!isNaN(date.getTime())) {
        // Adjust back by removing the Z interpretation - we want local time
        const localDate = new Date(dateTimeStr);
        if (!isNaN(localDate.getTime())) {
          return localDate;
        }
      }
    }

    // Try parsing as ISO 8601 (with or without timezone)
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
 * Extract events from parsed JSON structure
 */
function extractEventsFromParsedJson(parsed: any, context?: ExtractionContext): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  console.log('\n--- EXTRACTING EVENTS FROM PARSED JSON ---');
  console.log('Parsed object type:', typeof parsed);
  console.log('Parsed object keys:', parsed ? Object.keys(parsed).slice(0, 10) : 'null/undefined');

  if (!parsed || typeof parsed !== 'object') {
    console.log('Parsed object is null or not an object, returning empty events');
    return events;
  }

  try {
    // Strategy 1: Look for events array in parsed object
    if (Array.isArray(parsed.events)) {
      console.log(`Strategy 1: Found ${parsed.events.length} events in events array`);
      let convertedCount = 0;
      for (let i = 0; i < parsed.events.length; i++) {
        const eventData = parsed.events[i];
        console.log(`Processing event ${i + 1}: "${eventData?.title || 'NO TITLE'}"`);
        const event = convertSingleEventToCalendarEvent(eventData, context);
        if (event) {
          events.push(event);
          convertedCount++;
        } else {
          console.log(`  Failed to convert event ${i + 1}`);
        }
      }
      console.log(`Successfully converted ${convertedCount} out of ${parsed.events.length} events`);
    }
    // Strategy 2: Check if parsed object itself is an array of events
    else if (Array.isArray(parsed)) {
      console.log(`Strategy 2: Found ${parsed.length} events in direct array`);
      let convertedCount = 0;
      for (let i = 0; i < parsed.length; i++) {
        const eventData = parsed[i];
        console.log(`Processing direct array event ${i + 1}: "${eventData?.title || 'NO TITLE'}"`);
        const event = convertSingleEventToCalendarEvent(eventData, context);
        if (event) {
          events.push(event);
          convertedCount++;
        } else {
          console.log(`  Failed to convert direct array event ${i + 1}`);
        }
      }
      console.log(
        `Successfully converted ${convertedCount} out of ${parsed.length} direct array events`
      );
    }
    // Strategy 3: Check if parsed object is a single event
    else if (parsed.title && parsed.startDateTime) {
      console.log('Strategy 3: Found single event in parsed object');
      const event = convertSingleEventToCalendarEvent(parsed, context);
      if (event) {
        events.push(event);
        console.log('Successfully converted single event');
      } else {
        console.log('Failed to convert single event');
      }
    } else {
      console.log('No recognizable event structure found in parsed object');
      console.log('Parsed object structure:', JSON.stringify(parsed, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log(
      'Error extracting events from parsed JSON:',
      error instanceof Error ? error.message : String(error)
    );
    console.log('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
  }

  console.log(`Final result: ${events.length} events extracted`);
  return events;
}

/**
 * Process and deduplicate all collected events
 */
function processAndDeduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  console.log('\n--- PROCESSING AND DEDUPLICATING EVENTS ---');
  console.log(`Input: ${events.length} events`);

  if (events.length === 0) {
    console.log('No events to process, returning empty array');
    return events;
  }

  // Sort events by start time first
  console.log('Sorting events by start time...');
  const sortedEvents = events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  console.log(`Sorted ${sortedEvents.length} events`);

  // Enhanced deduplication with better matching
  const uniqueEvents = new Map<string, CalendarEvent>();
  let duplicatesFound = 0;

  console.log('Starting deduplication process...');
  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];

    if (!event) {
      console.log(`Warning: Event at index ${i} is undefined, skipping`);
      continue;
    }

    // Create a robust key for deduplication
    const normalizedTitle = event.title.toLowerCase().trim().replace(/\s+/g, ' ');
    const startTime = event.startTime.toISOString();
    const location = event.location.toLowerCase().trim();
    const key = `${normalizedTitle}-${startTime}-${location}`;

    if (i < 5 || i % 10 === 0) {
      // Log first 5 and every 10th event
      console.log(
        `Event ${i + 1}: "${event.title}" - ${event.startTime.toISOString()} - Key: ${key.substring(0, 50)}...`
      );
    }

    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    } else {
      duplicatesFound++;
      // If we have a duplicate, keep the one with more complete information
      const existing = uniqueEvents.get(key)!;
      const hasMoreInfo =
        (event.description?.length || 0) > (existing.description?.length || 0) ||
        (event.location !== 'TBD' && existing.location === 'TBD') ||
        (event.organizer && !existing.organizer) ||
        (event.url && !existing.url);

      if (hasMoreInfo) {
        console.log(`  Replacing duplicate with more complete version: "${event.title}"`);
        uniqueEvents.set(key, event);
      } else {
        console.log(`  Keeping existing version of: "${event.title}"`);
      }
    }
  }

  const result = Array.from(uniqueEvents.values());
  console.log(
    `Deduplication complete: ${events.length} → ${result.length} events (${duplicatesFound} duplicates removed)`
  );

  if (result.length === 0) {
    console.log('WARNING: All events were removed during deduplication!');
    console.log('Sample of original events for debugging:');
    events.slice(0, 5).forEach((event, idx) => {
      const normalizedTitle = event.title.toLowerCase().trim().replace(/\s+/g, ' ');
      const startTime = event.startTime.toISOString();
      const location = event.location.toLowerCase().trim();
      const key = `${normalizedTitle}-${startTime}-${location}`;
      console.log(
        `  ${idx + 1}. "${event.title}" - ${event.startTime.toISOString()} - ${event.location}`
      );
      console.log(`     Key: ${key}`);
    });

    // If all events were removed, this suggests massive duplication across responses
    // Let's be less aggressive with deduplication
    console.log('Attempting less aggressive deduplication...');
    const lessAggressiveResult = deduplicateWithTitleAndTimeOnly(events);
    console.log(
      `Less aggressive deduplication: ${events.length} → ${lessAggressiveResult.length} events`
    );
    return lessAggressiveResult;
  }

  return result;
}

/**
 * Less aggressive deduplication using only title and start time (no location)
 * Used as fallback when main deduplication removes all events
 */
function deduplicateWithTitleAndTimeOnly(events: CalendarEvent[]): CalendarEvent[] {
  console.log('\n--- FALLBACK DEDUPLICATION (Title + Time Only) ---');
  const uniqueEvents = new Map<string, CalendarEvent>();

  for (const event of events) {
    const normalizedTitle = event.title.toLowerCase().trim().replace(/\s+/g, ' ');
    const startTime = event.startTime.toISOString();
    const key = `${normalizedTitle}-${startTime}`;

    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    } else {
      // Keep the one with more complete information
      const existing = uniqueEvents.get(key)!;
      const hasMoreInfo =
        (event.description?.length || 0) > (existing.description?.length || 0) ||
        (event.location !== 'TBD' && existing.location === 'TBD') ||
        (event.organizer && !existing.organizer);

      if (hasMoreInfo) {
        uniqueEvents.set(key, event);
      }
    }
  }

  const result = Array.from(uniqueEvents.values()).sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  console.log(`Fallback deduplication result: ${result.length} events`);
  return result;
}

/**
 * Convert a single event object to CalendarEvent format
 */
function convertSingleEventToCalendarEvent(
  extracted: any,
  context?: ExtractionContext
): CalendarEvent | null {
  try {
    console.log(
      `  Converting event: title="${extracted?.title}", startDateTime="${extracted?.startDateTime}"`
    );

    if (!extracted || typeof extracted !== 'object') {
      console.log(`  Event conversion failed: extracted is not an object`);
      return null;
    }

    if (!extracted.title) {
      console.log(`  Event conversion failed: missing title`);
      return null;
    }

    if (!extracted.startDateTime) {
      console.log(`  Event conversion failed: missing startDateTime`);
      return null;
    }

    const eventTimezone = extracted.timezone || context?.timezoneHint || 'America/New_York';
    console.log(`  Using timezone: ${eventTimezone}`);

    const startTime = parseDateTime(extracted.startDateTime, context, eventTimezone);
    const endTime = extracted.endDateTime
      ? parseDateTime(extracted.endDateTime, context, eventTimezone)
      : addDefaultDuration(startTime);

    const event: CalendarEvent = {
      title: extracted.title,
      startTime,
      endTime,
      location: extracted.location || 'TBD',
      description: extracted.description || '',
      timezone: eventTimezone,
      organizer: extracted.organizer,
      recurringRule: extracted.recurringRule,
    };

    console.log(`  Successfully converted: "${event.title}" at ${event.startTime.toISOString()}`);
    return event;
  } catch (error) {
    console.error(
      `  Event conversion error: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(`  Event data:`, JSON.stringify(extracted, null, 2).substring(0, 200));
    return null;
  }
}

/**
 * Check if a response appears to be truncated
 */
function isResponseTruncated(responseText: string): boolean {
  // Look for signs of truncation in JSON
  const signs = [
    !responseText.trim().endsWith('}'), // JSON doesn't end properly
    responseText.includes('"tit'), // Cut off in the middle of "title"
    responseText.includes('"start'), // Cut off in the middle of "startDateTime"
    responseText.includes('"loc'), // Cut off in the middle of "location"
    /,\s*$/.test(responseText.trim()), // Ends with a comma
    /"[^"]*$/.test(responseText.trim()), // Ends with an unclosed quote
  ];

  return signs.some((sign) => sign);
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
        value: event.title,
      });
    }

    if (!event.startTime && !event.startDateTime) {
      eventErrors.push({
        eventIndex: index,
        field: 'startTime',
        message: 'Start time is required',
        value: event.startTime,
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
          value: event.startTime || event.startDateTime,
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
          value: event.endTime || event.endDateTime,
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
          value: event.endTime,
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
    invalidEvents,
  };
}

/**
 * Batch process multiple content chunks
 */
export async function batchExtractEvents(
  client: Anthropic,
  contentChunks: string[],
  context?: ExtractionContext,
  config?: AIConfiguration,
  options?: { concurrency?: number }
): Promise<CalendarEvent[]> {
  const concurrency = options?.concurrency || 3;
  const allEvents: CalendarEvent[] = [];

  // Process in batches to avoid rate limiting
  for (let i = 0; i < contentChunks.length; i += concurrency) {
    const batch = contentChunks.slice(i, i + concurrency);
    const batchPromises = batch.map((chunk) =>
      extractEvents(client, chunk, context, config).catch((err) => {
        console.error(`Failed to extract from chunk: ${err}`);
        return [];
      })
    );

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((events) => allEvents.push(...events));

    // Add delay between batches to avoid rate limiting
    if (i + concurrency < contentChunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
