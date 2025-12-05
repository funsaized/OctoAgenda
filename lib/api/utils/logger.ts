/**
 * Centralized Logging Service
 * Provides structured logging with request tracing using bunyan
 */
import bunyan, { LogLevel } from 'bunyan';

/**
 * Log levels available (bunyan standard levels)
 * trace=10, debug=20, info=30, warn=40, error=50, fatal=60
 */
export type { LogLevel };

/**
 * Request context for tracing logs across services
 */
export interface RequestContext {
  requestId: string;
  url?: string;
  method?: string;
}

/**
 * Service names for child loggers
 */
export type ServiceName =
  | 'route'
  | 'orchestrator'
  | 'firecrawl'
  | 'anthropic'
  | 'ics-generator'
  | 'cron';

/**
 * Logger type export for use in service signatures
 */
export type Logger = bunyan;

/**
 * Determine log level from environment
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

  if (level && validLevels.includes(level as LogLevel)) {
    return level as LogLevel;
  }

  // Default to 'debug' in development, 'info' in production
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

/**
 * Custom error serializer that includes additional ScraperError fields
 */
function errorSerializer(err: Error & { code?: string; details?: unknown; retryable?: boolean }) {
  const serialized = bunyan.stdSerializers.err(err);
  return {
    ...serialized,
    code: err.code,
    details: err.details,
    retryable: err.retryable,
  };
}

/**
 * Root logger instance
 * All child loggers inherit from this
 */
const rootLogger = bunyan.createLogger({
  name: 'ics-scraper',
  level: getLogLevel(),
  serializers: {
    err: errorSerializer,
    error: errorSerializer,
  },
});

/**
 * Create a request-scoped logger with tracing context
 * Use this at the start of each API request
 *
 * @param context - Request context including requestId
 * @returns Child logger bound to the request
 *
 * @example
 * const requestId = crypto.randomUUID();
 * const log = createRequestLogger({ requestId, url: '/api/scrape', method: 'POST' });
 * log.info('Request received');
 */
export function createRequestLogger(context: RequestContext): Logger {
  return rootLogger.child({
    requestId: context.requestId,
    url: context.url,
    method: context.method,
  });
}

/**
 * Create a service-specific child logger
 * Use within services to add service context to logs
 *
 * @param parentLogger - Parent logger (typically from request)
 * @param service - Service name identifier
 * @returns Child logger with service binding
 *
 * @example
 * const serviceLog = createServiceLogger(log, 'firecrawl');
 * serviceLog.info({ url }, 'Starting scrape');
 */
export function createServiceLogger(parentLogger: Logger, service: ServiceName): Logger {
  return parentLogger.child({ service });
}

/**
 * Generate a unique request ID
 * Uses crypto.randomUUID() for unique identification
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Get the root logger for system-level logging
 * Use sparingly - prefer request-scoped loggers
 */
export function getRootLogger(): Logger {
  return rootLogger;
}

/**
 * Logging helper for timing operations
 * Returns elapsed time in milliseconds
 *
 * @example
 * const startTime = Date.now();
 * // ... operation ...
 * log.info({ durationMs: elapsed(startTime) }, 'Operation complete');
 */
export function elapsed(startTime: number): number {
  return Date.now() - startTime;
}

/**
 * Safe object for logging - redacts sensitive fields
 * Use when logging objects that might contain secrets
 */
export function safeLogObject<T extends Record<string, unknown>>(
  obj: T,
  redactKeys: string[] = ['apiKey', 'password', 'secret', 'token', 'authorization']
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of redactKeys) {
    if (key in result) {
      result[key] = '[REDACTED]';
    }
  }
  return result;
}

export default rootLogger;
