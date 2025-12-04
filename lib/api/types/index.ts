/**
 * Core type definitions for the ICS Event Scraper
 */

// =============================================================================
// Core Event Types
// =============================================================================

/**
 * Represents a calendar event extracted from the source
 */
export interface CalendarEvent {
  title: string;
  location: string;
  startTime: Date;
  endTime: Date;
  description: string;
  organizer?: EventOrganizer;
  attendees?: EventAttendee[];
  timezone: string;
  recurringRule?: string;
  uid?: string;
  categories?: string[];
  status?: EventStatus;
  url?: string;
}

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';

export interface EventOrganizer {
  name: string;
  email?: string;
  phone?: string;
}

export interface EventAttendee {
  name: string;
  email: string;
  rsvp?: boolean;
  status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION';
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT' | 'CHAIR';
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface SourceConfiguration {
  url: string;
  selectors?: {
    eventContainer?: string;
    title?: string;
    datetime?: string;
    location?: string;
    description?: string;
  };
  headers?: Record<string, string>;
  userAgent?: string;
  timeout?: number;
}

export interface AIConfiguration {
  apiKey: string;
  model: 'claude-haiku-4-5-20251001';
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  maxContinuations?: number;
}

export interface RetryConfiguration {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ProcessingOptions {
  retry: RetryConfiguration;
  cache: {
    enabled: boolean;
    ttl: number;
  };
  timezone: {
    default: string;
    autoDetect: boolean;
  };
  ai: AIConfiguration;
}

export interface ICSOptions {
  prodId?: string;
  calendarName?: string;
  description?: string;
  timezone?: string;
  includeAlarms?: boolean;
  defaultAlarmMinutes?: number;
  method?: 'PUBLISH' | 'REQUEST' | 'REPLY' | 'CANCEL';
  scale?: 'GREGORIAN';
}

export interface ScraperConfig {
  source: SourceConfiguration;
  processing?: Partial<ProcessingOptions>;
  ics?: Partial<ICSOptions>;
}

// =============================================================================
// Result Types
// =============================================================================

export interface ScraperResult {
  events: CalendarEvent[];
  icsContent?: string;
  metadata: {
    totalEvents: number;
    processedEvents: number;
    failedEvents: number;
    processingTime: number;
    warnings: string[];
  };
}

// =============================================================================
// Error Handling
// =============================================================================

export class ScraperError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: Record<string, unknown>,
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

  // HTTP errors
  HTTP_CLIENT_ERROR = 'HTTP_CLIENT_ERROR',
  HTTP_SERVER_ERROR = 'HTTP_SERVER_ERROR',

  // Parsing errors
  PARSE_ERROR = 'PARSE_ERROR',
  INVALID_HTML = 'INVALID_HTML',

  // AI errors
  AI_API_ERROR = 'AI_API_ERROR',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',

  // Validation errors
  INVALID_EVENT_DATA = 'INVALID_EVENT_DATA',

  // System errors
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

// =============================================================================
// SSE Event Types (for streaming API)
// =============================================================================

export type SSEEvent =
  | { type: 'status'; data: { message: string } }
  | { type: 'event'; data: CalendarEvent }
  | { type: 'complete'; data: ScraperResult }
  | { type: 'error'; data: { code: ErrorCode; message: string } };
