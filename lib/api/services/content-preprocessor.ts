/**
 * Content Preprocessor Service
 * Cleans and prepares HTML content for event extraction
 */
import * as cheerio from 'cheerio';

/**
 * Processed content ready for AI analysis
 */
export interface ProcessedContent {
  /** Cleaned text content */
  cleanedText: string;

  /** Identified event containers */
  eventContainers: EventContainer[];

  /** Structured data found in HTML */
  structuredData: StructuredEvent[];

  /** Content chunks for API processing */
  chunks: ContentChunk[];

  /** Metadata about the content */
  metadata: ContentMetadata;
}

/**
 * Potential event container from HTML
 */
export interface EventContainer {
  /** Container HTML element type */
  type: string;

  /** CSS classes */
  classes: string[];

  /** Text content */
  text: string;

  /** Extracted date/time hints */
  dateHints: string[];

  /** Extracted location hints */
  locationHints: string[];

  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Structured event data extracted from HTML
 */
export interface StructuredEvent {
  /** Event title */
  title?: string;

  /** Event date/time string */
  datetime?: string;

  /** Event location */
  location?: string;

  /** Event description */
  description?: string;

  /** Source of structured data */
  source: 'json-ld' | 'microdata' | 'rdfa' | 'regex';

  /** Raw data */
  raw?: any;
}

/**
 * Content chunk for API processing
 */
export interface ContentChunk {
  /** Chunk content */
  content: string;

  /** Estimated token count */
  tokenCount: number;

  /** Chunk context */
  context: 'event' | 'general' | 'navigation' | 'footer';

  /** Priority for processing */
  priority: number;
}

/**
 * Metadata about processed content
 */
export interface ContentMetadata {
  /** Total text length */
  totalLength: number;

  /** Number of potential events found */
  potentialEvents: number;

  /** Detected language */
  language?: string;

  /** Page title */
  title?: string;

  /** Page description */
  description?: string;
}

/**
 * Common date/time patterns
 */
const DATE_PATTERNS = [
  // ISO 8601
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/gi,

  // Common formats
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi,
  /\b\d{1,2}-\d{1,2}-\d{2,4}\b/gi,
  /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/gi,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/gi,

  // Day names
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/gi,

  // Time patterns
  /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/gi,
  /\b\d{1,2}\s*(am|pm|AM|PM)\b/gi,

  // Relative dates
  /\b(today|tomorrow|tonight|this\s+week|next\s+week|this\s+month|next\s+month)\b/gi,
];

/**
 * Location patterns
 */
const LOCATION_PATTERNS = [
  // Addresses
  /\b\d+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Plaza|Place|Pl)\b/gi,

  // Room/Building
  /\b(Room|Rm|Building|Bldg|Hall|Auditorium|Theater|Theatre|Center|Centre)\s+[A-Z0-9][A-Za-z0-9\-]*\b/gi,

  // Virtual indicators
  /\b(Online|Virtual|Zoom|Teams|Meet|Webinar|Livestream|Remote)\b/gi,

  // Venue patterns
  /\b(at|@|venue:|location:)\s*([A-Z][a-z]+(\s+[A-Z][a-z]+)*)/gi,

  // City, State patterns
  /\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/g,
];

// TODO: make this a more robust library (use AI to generate something crazy...)
/**
 * Event-related CSS selectors
 */
const EVENT_SELECTORS = [
  '.event',
  '.events',
  '.event-item',
  '.event-container',
  '.calendar-event',
  '.upcoming-event',
  '.event-listing',
  '[class*="event"]',
  '[id*="event"]',
  'article',
  'section.events',
  'div.calendar',
  '[itemtype*="Event"]',
  '[typeof*="Event"]',
];

/**
 * Clean HTML and extract text content
 */
export function preprocessHTML(html: string): ProcessedContent {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, noscript, iframe, svg').remove();
  $('*')
    .contents()
    .filter(function () {
      return this.type === 'comment';
    })
    .remove();

  // Extract metadata
  const metadata: ContentMetadata = {
    totalLength: $.text().length,
    potentialEvents: 0,
    title: $('title').text() || $('meta[property="og:title"]').attr('content'),
    description:
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content'),
    language: $('html').attr('lang') || 'en',
  };

  // TODO: do we need this/what?
  // Extract structured data
  const structuredData = extractStructuredData(html);

  // Find event containers
  const eventContainers = findEventContainers($);
  metadata.potentialEvents = eventContainers.length;

  // Clean and prepare text
  const cleanedText = cleanText($.text());

  // Create content chunks
  const chunks = createContentChunks($, eventContainers);

  return {
    cleanedText,
    eventContainers,
    structuredData,
    chunks,
    metadata,
  };
}

/**
 * Find potential event containers in HTML
 */
function findEventContainers($: cheerio.CheerioAPI): EventContainer[] {
  const containers: EventContainer[] = [];

  EVENT_SELECTORS.forEach((selector) => {
    $(selector).each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();

      if (text.length < 20 || text.length > 5000) return;

      const dateHints = extractDateHints(text);
      const locationHints = extractLocationHints(text);

      // Calculate confidence based on hints found
      const confidence = calculateEventConfidence(text, dateHints, locationHints);

      if (confidence > 0.3) {
        containers.push({
          type: (element as any).name || 'div',
          classes: ($el.attr('class') || '').split(' ').filter((c) => c),
          text: cleanText(text),
          dateHints,
          locationHints,
          confidence,
        });
      }
    });
  });

  // Sort by confidence
  return containers.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extract date hints from text
 */
function extractDateHints(text: string): string[] {
  const hints: string[] = [];

  DATE_PATTERNS.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      hints.push(...matches);
    }
  });

  return [...new Set(hints)];
}

/**
 * Extract location hints from text
 */
function extractLocationHints(text: string): string[] {
  const hints: string[] = [];

  LOCATION_PATTERNS.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      hints.push(...matches);
    }
  });

  return [...new Set(hints)];
}

/**
 * Calculate confidence that text contains event information
 */
function calculateEventConfidence(
  text: string,
  dateHints: string[],
  locationHints: string[]
): number {
  let score = 0;

  // Check for date information
  if (dateHints.length > 0) score += 0.3;
  if (dateHints.length > 1) score += 0.1;

  // Check for location information
  if (locationHints.length > 0) score += 0.2;

  // Check for event keywords
  const eventKeywords =
    /\b(event|meeting|conference|workshop|seminar|webinar|session|presentation|talk|lecture|class|course|training|celebration|party|reception|gathering|festival|show|performance|concert|exhibition)\b/gi;
  const keywordMatches = text.match(eventKeywords);
  if (keywordMatches) score += Math.min(0.3, keywordMatches.length * 0.1);

  // Check for time indicators
  const timeIndicators = /\b(start|begin|end|from|to|until|during|at|on)\b/gi;
  if (timeIndicators.test(text)) score += 0.1;

  // Check for registration/RSVP keywords
  const registrationKeywords =
    /\b(register|registration|rsvp|sign up|signup|ticket|attend|join)\b/gi;
  if (registrationKeywords.test(text)) score += 0.1;

  return Math.min(1, score);
}

/**
 * Clean text content
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Create content chunks for API processing
 */
function createContentChunks(
  $: cheerio.CheerioAPI,
  eventContainers: EventContainer[]
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const maxTokensPerChunk = 3000;
  const avgCharsPerToken = 4;

  // High priority: Event containers
  eventContainers.slice(0, 10).forEach((container, index) => {
    const tokenCount = Math.ceil(container.text.length / avgCharsPerToken);

    if (tokenCount <= maxTokensPerChunk) {
      chunks.push({
        content: container.text,
        tokenCount,
        context: 'event',
        priority: 10 - index,
      });
    } else {
      // Split large containers
      const parts = splitTextIntoChunks(container.text, maxTokensPerChunk * avgCharsPerToken);
      parts.forEach((part, partIndex) => {
        chunks.push({
          content: part,
          tokenCount: Math.ceil(part.length / avgCharsPerToken),
          context: 'event',
          priority: 10 - index - partIndex * 0.1,
        });
      });
    }
  });

  // Medium priority: Main content areas
  const mainContent = $('main, article, .content, #content').text();
  if (mainContent && !chunks.some((c) => c.content.includes(mainContent.substring(0, 100)))) {
    const mainChunks = splitTextIntoChunks(
      cleanText(mainContent),
      maxTokensPerChunk * avgCharsPerToken
    );

    mainChunks.forEach((chunk, index) => {
      chunks.push({
        content: chunk,
        tokenCount: Math.ceil(chunk.length / avgCharsPerToken),
        context: 'general',
        priority: 5 - index * 0.1,
      });
    });
  }

  return chunks.sort((a, b) => b.priority - a.priority);
}

/**
 * Split text into chunks
 */
function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChars) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks;
}

/**
 * Extract structured data from HTML
 */
export function extractStructuredData(html: string): StructuredEvent[] {
  const events: StructuredEvent[] = [];
  const $ = cheerio.load(html);

  // Extract JSON-LD
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const json = JSON.parse($(element).html() || '{}');

      if (json['@type'] === 'Event' || json.type === 'Event') {
        events.push({
          title: json.name,
          datetime: json.startDate,
          location:
            typeof json.location === 'object'
              ? json.location.name || json.location.address
              : json.location,
          description: json.description,
          source: 'json-ld',
          raw: json,
        });
      }

      // Handle arrays of events
      if (Array.isArray(json)) {
        json.forEach((item) => {
          if (item['@type'] === 'Event' || item.type === 'Event') {
            events.push({
              title: item.name,
              datetime: item.startDate,
              location:
                typeof item.location === 'object'
                  ? item.location.name || item.location.address
                  : item.location,
              description: item.description,
              source: 'json-ld',
              raw: item,
            });
          }
        });
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  // Extract Microdata
  $('[itemtype*="Event"], [itemtype*="event"]').each((_, element) => {
    const $el = $(element);

    events.push({
      title: $el.find('[itemprop="name"]').text(),
      datetime:
        $el.find('[itemprop="startDate"]').attr('content') ||
        $el.find('[itemprop="startDate"]').text(),
      location: $el.find('[itemprop="location"]').text(),
      description: $el.find('[itemprop="description"]').text(),
      source: 'microdata',
    });
  });

  // Extract RDFa
  $('[typeof*="Event"], [typeof*="event"]').each((_, element) => {
    const $el = $(element);

    events.push({
      title: $el.find('[property="name"]').text(),
      datetime:
        $el.find('[property="startDate"]').attr('content') ||
        $el.find('[property="startDate"]').text(),
      location: $el.find('[property="location"]').text(),
      description: $el.find('[property="description"]').text(),
      source: 'rdfa',
    });
  });

  // Fallback regex extraction
  const text = cleanText($.text());
  const fallbackEvents = extractEventsWithRegex(text);
  events.push(...fallbackEvents);

  // Filter out empty events
  return events.filter((e) => e.title || e.datetime || e.location);
}

/**
 * Extract events using regex patterns
 */
function extractEventsWithRegex(text: string): StructuredEvent[] {
  const events: StructuredEvent[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const dateMatches = extractDateHints(line);

    if (dateMatches.length > 0) {
      // Look for title in same line or previous line
      const title =
        (dateMatches[0] ? line.replace(dateMatches[0], '').trim() : line.trim()) ||
        (i > 0 ? lines[i - 1]?.trim() : '');

      // Look for location in same line or next line
      const locationHints = extractLocationHints(line + ' ' + (lines[i + 1] || ''));

      if (title || locationHints.length > 0) {
        events.push({
          title: title,
          datetime: dateMatches[0],
          location: locationHints[0],
          source: 'regex',
        });
      }
    }
  }

  return events;
}

/**
 * Estimate token count for text
 */
export function estimateTokenCount(text: string): number {
  // Simple estimation: ~4 characters per token on average
  return Math.ceil(text.length / 4);
}

/**
 * Validate if content contains events
 */
export function hasEventContent(processedContent: ProcessedContent): boolean {
  return (
    processedContent.eventContainers.length > 0 ||
    processedContent.structuredData.length > 0 ||
    processedContent.metadata.potentialEvents > 0
  );
}
