/**
 * Anthropic AI Integration Service - STREAMING VERSION
 * Uses Claude Haiku 4.5 with streaming for real-time event extraction
 */
import { AIConfiguration, CalendarEvent, ErrorCode, ScraperError } from '@/lib/api/types/index';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Extraction context for AI processing
 */
export interface ExtractionContext {
  sourceUrl?: string;
  timezoneHint?: string;
  currentDate?: Date;
  language?: string;
  additionalContext?: string;
}

/**
 * Validation result for extracted events
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  validatedEvents: CalendarEvent[];
  invalidEvents: unknown[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  eventIndex: number;
  field: string;
  message: string;
  value?: unknown;
}

/**
 * System prompt for event extraction
 */
const SYSTEM_PROMPT = `You are a calendar event extraction specialist. Your PRIMARY OBJECTIVE is to extract EVERY SINGLE event from the provided content.

CRITICAL MISSION:
1. Scan the ENTIRE content from beginning to end
2. Count ALL events present in the content
3. Extract ALL events - if you count 50 events, extract all 50
4. Do NOT stop after a few events - extract EVERYTHING

Return a JSON object: {"events": [...ALL events...]}

Each event requires these EXACT field names:
- title: event name (string, required)
- startTime: local ISO 8601 WITHOUT "Z", e.g. "2025-08-12T18:00:00" (required)
- endTime: local ISO 8601 WITHOUT "Z" (optional, defaults to startTime + 2 hours)
- location: venue/address or "TBD" (string)
- description: event details (string, can be empty "")
- timezone: IANA format "America/New_York", "America/Chicago", etc. (required)
- organizer: {name, email?, phone?} (optional object)
- recurringRule: RRULE format (optional)
- url: event URL (optional)

MANDATORY REQUIREMENTS:
- Use "startTime" and "endTime" (NOT startDateTime/endDateTime)
- Times in LOCAL time WITHOUT "Z" suffix
- Extract EVERY event - scan entire content multiple times if needed
- Process ALL sections, ALL tables, ALL lists
- If content has 100+ events, extract ALL 100+ events

For streaming: Output events chronologically. If hitting token limit, close JSON with ]} and continue when asked.

Only return {"events": []} if content truly has NO events.`;

/**
 * Create Anthropic client
 */
export function createAnthropicClient(config: AIConfiguration): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
  });
}

/**
 * Stream events from content using Claude AI with real-time updates
 */
export async function* streamExtractEvents(
  client: Anthropic,
  content: string,
  context?: ExtractionContext,
  config?: AIConfiguration
): AsyncGenerator<CalendarEvent, void, unknown> {
  const userPrompt = buildUserPrompt(content, context);
  let accumulatedText = '';
  let allEvents: CalendarEvent[] = [];
  let continuationCount = 0;
  const maxContinuations = config?.maxContinuations ?? 10;

  const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userPrompt },
  ];

  while (continuationCount <= maxContinuations) {
    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64000,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: conversationMessages,
      });

      let chunkText = '';
      let lastYieldedCount = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          chunkText += event.delta.text;
          accumulatedText += event.delta.text;

          // Try to parse and yield events incrementally every 1000 chars
          if (accumulatedText.length - lastYieldedCount > 1000) {
            const newEvents = parseStreamedResponse(accumulatedText, context, allEvents.length);

            for (const newEvent of newEvents) {
              if (!isDuplicate(newEvent, allEvents)) {
                allEvents.push(newEvent);
                yield newEvent;
              }
            }

            lastYieldedCount = accumulatedText.length;
          }
        }
      }

      const finalMessage = await stream.finalMessage();

      // Add assistant's response to conversation
      conversationMessages.push({
        role: 'assistant',
        content: chunkText,
      });

      // Parse final batch of events
      const newEvents = parseStreamedResponse(accumulatedText, context, allEvents.length);

      for (const event of newEvents) {
        if (!isDuplicate(event, allEvents)) {
          allEvents.push(event);
          yield event;
        }
      }

      // Check if we should continue
      const stopReason = finalMessage?.stop_reason;
      const shouldContinue = stopReason === 'max_tokens' && continuationCount < maxContinuations;

      if (!shouldContinue) {
        break;
      }

      // Request continuation
      conversationMessages.push({
        role: 'user',
        content: `Continue extracting the remaining events. You've already extracted ${allEvents.length} events. Continue with the next events in the list.`,
      });

      continuationCount++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const err = error as Error & { status?: number };

      // Handle retryable errors
      if (err.status === 529 || (err.status && err.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      throw new ScraperError(
        `Streaming extraction failed: ${err.message}`,
        ErrorCode.AI_API_ERROR,
        { error: err.message },
        false
      );
    }
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

  prompt += `\n---MARKDOWN CONTENT---\n${content}\n---END CONTENT---\n\n`;
  prompt += 'Extract all events from the above content and return as JSON with an "events" array.';

  return prompt;
}

/**
 * Parse streamed response, handling partial JSON
 */
function parseStreamedResponse(
  accumulatedText: string,
  context?: ExtractionContext,
  skipCount: number = 0
): CalendarEvent[] {
  try {
    // Find JSON in the response
    const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const jsonStr = jsonMatch[0];

    // Try to parse the JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON is incomplete, try to fix it by adding closing brackets
      let fixed = jsonStr;

      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      if (openBrackets > closeBrackets) {
        fixed += ']'.repeat(openBrackets - closeBrackets);
      }
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
      }

      try {
        parsed = JSON.parse(fixed);
      } catch {
        return [];
      }
    }

    if (!parsed.events || !Array.isArray(parsed.events)) {
      return [];
    }

    const newEvents = parsed.events.slice(skipCount);
    const events: CalendarEvent[] = [];

    for (const eventData of newEvents) {
      const event = convertToCalendarEvent(eventData, context);
      if (event) {
        events.push(event);
      }
    }

    return events;
  } catch {
    return [];
  }
}

/**
 * Convert extracted event data to CalendarEvent
 */
function convertToCalendarEvent(data: unknown, context?: ExtractionContext): CalendarEvent | null {
  const event = data as Record<string, unknown>;
  try {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const title = event.title as string | undefined;
    if (!title?.trim()) {
      return null;
    }

    if (!event.startTime) {
      return null;
    }

    const startTime = new Date(event.startTime as string);
    if (isNaN(startTime.getTime())) {
      return null;
    }

    const endTime = event.endTime
      ? new Date(event.endTime as string)
      : new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const timezone = (event.timezone as string) || context?.timezoneHint || 'America/New_York';

    return {
      title: title.trim(),
      startTime,
      endTime,
      location: ((event.location as string) || 'TBD').trim(),
      description: ((event.description as string) || '').trim(),
      timezone,
      organizer: event.organizer as CalendarEvent['organizer'],
      recurringRule: event.recurringRule as string | undefined,
      url: event.url as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Check if event is duplicate
 */
function isDuplicate(event: CalendarEvent, existingEvents: CalendarEvent[]): boolean {
  const normalizedTitle = event.title.toLowerCase().trim().replace(/\s+/g, ' ');
  const key = `${normalizedTitle}|${event.startTime.toISOString()}`;

  return existingEvents.some((existing) => {
    const existingTitle = existing.title.toLowerCase().trim().replace(/\s+/g, ' ');
    const existingKey = `${existingTitle}|${existing.startTime.toISOString()}`;
    return existingKey === key;
  });
}

/**
 * Validate extracted events
 */
export function validateExtraction(events: unknown[]): ValidationResult {
  const errors: ValidationError[] = [];
  const validatedEvents: CalendarEvent[] = [];
  const invalidEvents: unknown[] = [];

  events.forEach((rawEvent, index) => {
    const event = rawEvent as Record<string, unknown>;
    const eventErrors: ValidationError[] = [];

    const title = event?.title as string | undefined;
    if (!title || title.trim().length === 0) {
      eventErrors.push({
        eventIndex: index,
        field: 'title',
        message: 'Title is required',
        value: title,
      });
    }

    if (!event?.startTime) {
      eventErrors.push({
        eventIndex: index,
        field: 'startTime',
        message: 'Start time is required',
        value: event?.startTime,
      });
    }

    if (eventErrors.length === 0) {
      validatedEvents.push(rawEvent as CalendarEvent);
    } else {
      invalidEvents.push(rawEvent);
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
