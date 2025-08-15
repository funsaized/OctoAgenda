/**
 * Core type definitions for the ICS Event Scraper
 */

/**
 * Represents a calendar event extracted from the source
 */
export interface CalendarEvent {
  /** Event title/summary */
  title: string;

  /** Physical or virtual location of the event */
  location: string;

  /** Event start time in UTC */
  startTime: Date;

  /** Event end time in UTC */
  endTime: Date;

  /** Detailed description of the event */
  description: string;

  /** Event organizer information */
  organizer?: EventOrganizer;

  /** List of event attendees */
  attendees?: EventAttendee[];

  /** Timezone identifier (e.g., 'America/New_York') */
  timezone: string;

  /** Recurrence rule in RRULE format (RFC 5545) */
  recurringRule?: string;

  /** Unique identifier for the event */
  uid?: string;

  /** Event categories/tags */
  categories?: string[];

  /** Event status: CONFIRMED, TENTATIVE, CANCELLED */
  status?: EventStatus;

  /** URL for more information about the event */
  url?: string;
}

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';

/**
 * Event organizer details
 */
export interface EventOrganizer {
  /** Organizer's display name */
  name: string;

  /** Organizer's email address */
  email?: string;

  /** Organizer's phone number */
  phone?: string;
}

/**
 * Event attendee details
 */
export interface EventAttendee {
  /** Attendee's display name */
  name: string;

  /** Attendee's email address (required for calendar invites) */
  email: string;

  /** Attendee's RSVP status */
  rsvp?: boolean;

  /** Participation status */
  status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION';

  /** Attendee role */
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT' | 'CHAIR';
}

/**
 * Configuration for the HTML source to scrape
 */
export interface SourceConfiguration {
  /** URL of the events page to scrape */
  url: string;

  /** CSS selectors for extracting specific elements */
  selectors?: {
    /** Selector for event containers */
    eventContainer?: string;

    /** Selector for event title */
    title?: string;

    /** Selector for event date/time */
    datetime?: string;

    /** Selector for event location */
    location?: string;

    /** Selector for event description */
    description?: string;
  };

  /** Custom headers to send with the request */
  headers?: Record<string, string>;

  /** User agent string for the request */
  userAgent?: string;

  /** Regex patterns for extracting data */
  patterns?: {
    /** Pattern for extracting dates */
    date?: RegExp;

    /** Pattern for extracting times */
    time?: RegExp;

    /** Pattern for extracting locations */
    location?: RegExp;
  };

  /** Whether the page requires JavaScript rendering */
  requiresJavaScript?: boolean;

  /** Maximum wait time for dynamic content (ms) */
  waitForSelector?: string;

  /** Timeout for page load (ms) */
  timeout?: number;
}

/**
 * Calendar service configuration
 */
export interface CalendarConfiguration {
  /** Service endpoint URL */
  endpoint: string;

  /** Authentication credentials */
  credentials: CalendarCredentials;

  /** Calendar-specific settings */
  settings?: {
    /** Calendar name/ID */
    calendarName?: string;

    /** Default reminder minutes before event */
    defaultReminder?: number;

    /** Whether to send invites to attendees */
    sendInvites?: boolean;

    /** Color for events */
    eventColor?: string;
  };
}

/**
 * Calendar service authentication
 */
export interface CalendarCredentials {
  /** Authentication type */
  type: 'basic' | 'oauth2' | 'api-key';

  /** Username for basic auth */
  username?: string;

  /** Password for basic auth */
  password?: string;

  /** OAuth2 access token */
  accessToken?: string;

  /** OAuth2 refresh token */
  refreshToken?: string;

  /** API key */
  apiKey?: string;

  /** Additional auth parameters */
  extra?: Record<string, any>;
}

/**
 * Processing options for the scraper
 */
export interface ProcessingOptions {
  /** Number of events to process in parallel */
  batchSize: number;

  /** Retry configuration */
  retry: RetryConfiguration;

  /** Cache configuration */
  cache: CacheConfiguration;

  /** Timezone handling */
  timezone: TimezoneConfiguration;

  /** AI model configuration */
  ai: AIConfiguration;

  /** Debug and logging options */
  debug?: DebugOptions;
}

/**
 * Retry logic configuration
 */
export interface RetryConfiguration {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay between retries (ms) */
  initialDelay: number;

  /** Maximum delay between retries (ms) */
  maxDelay: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** Which errors should trigger a retry */
  retryableErrors?: string[];
}

/**
 * Cache configuration
 */
export interface CacheConfiguration {
  /** Whether caching is enabled */
  enabled: boolean;

  /** Time-to-live for cache entries (seconds) */
  ttl: number;

  /** Maximum number of cached entries */
  maxSize?: number;

  /** Cache storage type */
  storage?: 'memory' | 'redis' | 'file';
}

/**
 * Timezone configuration
 */
export interface TimezoneConfiguration {
  /** Default timezone if detection fails */
  default: string;

  /** Whether to auto-detect timezone from content */
  autoDetect: boolean;

  /** Timezone detection hints */
  hints?: string[];
}

/**
 * AI model configuration
 */
export interface AIConfiguration {
  /** Anthropic API key */
  apiKey: string;

  /** Model to use */
  model: 'claude-3-haiku-20240307' | 'claude-3-sonnet-20240229' | 'claude-3-5-sonnet-20241022';

  /** Maximum tokens for response */
  maxTokens?: number;

  /** Temperature for generation */
  temperature?: number;

  /** System prompt override */
  systemPrompt?: string;

  /** Maximum number of continuation attempts */
  maxContinuations?: number;
}

/**
 * Debug options
 */
export interface DebugOptions {
  /** Enable verbose logging */
  verbose: boolean;

  /** Log HTTP requests/responses */
  logRequests: boolean;

  /** Log AI prompts/responses */
  logAI: boolean;

  /** Save scraped HTML to file */
  saveHTML: boolean;

  /** Save extracted events to file */
  saveEvents: boolean;
}

/**
 * Anthropic API response structure
 */
export interface AnthropicResponse {
  /** Response ID */
  id: string;

  /** Response type */
  type: 'message';

  /** Role of the responder */
  role: 'assistant';

  /** Response content */
  content: Array<{
    type: 'text';
    text: string;
  }>;

  /** Model used */
  model: string;

  /** Token usage */
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Parsed event data from AI extraction
 */
export interface ExtractedEventData {
  /** Extracted events */
  events: CalendarEvent[];

  /** Extraction confidence score (0-1) */
  confidence: number;

  /** Any warnings or issues during extraction */
  warnings?: string[];

  /** Detected source timezone */
  detectedTimezone?: string;

  /** Metadata about the extraction */
  metadata?: {
    /** Number of potential events found */
    totalFound: number;

    /** Number successfully parsed */
    successfullyParsed: number;

    /** Extraction timestamp */
    extractedAt: Date;
  };
}

/**
 * Error types for different failure scenarios
 */
export class ScraperError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: any,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  DNS_FAILURE = 'DNS_FAILURE',

  // HTTP errors
  HTTP_CLIENT_ERROR = 'HTTP_CLIENT_ERROR',
  HTTP_SERVER_ERROR = 'HTTP_SERVER_ERROR',
  HTTP_NOT_FOUND = 'HTTP_NOT_FOUND',

  // Parsing errors
  PARSE_ERROR = 'PARSE_ERROR',
  INVALID_HTML = 'INVALID_HTML',
  SELECTOR_NOT_FOUND = 'SELECTOR_NOT_FOUND',

  // AI errors
  AI_API_ERROR = 'AI_API_ERROR',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',
  AI_INVALID_RESPONSE = 'AI_INVALID_RESPONSE',

  // Calendar errors
  CALENDAR_AUTH_ERROR = 'CALENDAR_AUTH_ERROR',
  CALENDAR_WRITE_ERROR = 'CALENDAR_WRITE_ERROR',
  CALENDAR_CONFLICT = 'CALENDAR_CONFLICT',

  // Validation errors
  INVALID_EVENT_DATA = 'INVALID_EVENT_DATA',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System errors
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = ScraperError> = { success: true; data: T } | { success: false; error: E };

/**
 * HTTP fetch options
 */
export interface FetchOptions {
  /** Request headers */
  headers?: Record<string, string>;

  /** User agent string */
  userAgent?: string;

  /** Request timeout in ms */
  timeout?: number;

  /** Whether to follow redirects */
  followRedirects?: boolean;

  /** Maximum number of redirects to follow */
  maxRedirects?: number;

  /** Retry configuration */
  retry?: Partial<RetryConfiguration>;

  /** Whether to use cache */
  useCache?: boolean;

  /** Cache key override */
  cacheKey?: string;
}

/**
 * ICS generation options
 */
export interface ICSOptions {
  /** Calendar product ID */
  prodId?: string;

  /** Calendar name */
  calendarName?: string;

  /** Calendar description */
  description?: string;

  /** Calendar timezone */
  timezone?: string;

  /** Whether to include alarms */
  includeAlarms?: boolean;

  /** Default alarm minutes before event */
  defaultAlarmMinutes?: number;

  /** Calendar method (REQUEST, PUBLISH, etc.) */
  method?: 'PUBLISH' | 'REQUEST' | 'REPLY' | 'CANCEL';

  /** Calendar scale */
  scale?: 'GREGORIAN';
}

/**
 * Monitoring event data
 */
export interface MonitoringEvent {
  /** Event type */
  type:
    | 'scrape_start'
    | 'scrape_complete'
    | 'scrape_error'
    | 'event_extracted'
    | 'calendar_updated'
    | 'cache_hit'
    | 'cache_miss';

  /** Event timestamp */
  timestamp: Date;
}

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

    /** Enhanced processing metrics */
    enhancedProcessing?: {
      tokenReduction: number;
      qualityScore: number;
      eventContentRatio: number;
      structuredEventsFound: number;
      chunksProcessed: number;
      processingStats: {
        htmlAnalysisTime: number;
        contentExtractionTime: number;
        chunkingTime: number;
        qualityAssessmentTime: number;
      };
    };

    /** Warnings */
    warnings: string[];
  };
}
