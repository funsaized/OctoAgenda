import { ScraperConfig } from '@/lib/api/types/index';

/**
 * Processing constants used throughout the application
 */
export const PROCESSING_CONSTANTS = {
  // Token estimation
  CHARS_PER_TOKEN: 4,
  AVG_CHARS_PER_TOKEN: 4,

  // Chunking configuration
  CHUNK_SIZE_TOKENS: 800,
  CHUNK_OVERLAP_TOKENS: 100,
  MAX_CHUNKS_PER_BATCH: 15,
  MAX_TOKENS_PER_CHUNK: 3000,

  // Content length thresholds
  MIN_CONTENT_LENGTH: 20,
  MAX_CONTENT_LENGTH: 5000,
  MIN_BLOCK_LENGTH: 20,
  MAX_BLOCK_LENGTH: 3000,

  // Quality thresholds
  QUALITY_THRESHOLD: 0.3,
  MIN_RELEVANCE_THRESHOLD: 0.1,
  EVENT_CONFIDENCE_THRESHOLD: 0.3,
  HIGH_QUALITY_SCORE_THRESHOLD: 0.3,

  // Scoring weights
  EVENT_SCORE_WEIGHT: 0.6,
  RELEVANCE_SCORE_WEIGHT: 0.4,

  // Batch processing
  DEFAULT_BATCH_SIZE: 5,
  MAX_PRIORITY_CHUNKS: 20,
  MAX_EVENT_CONTAINERS: 10,
  AI_CONCURRENCY: 3,

  // Deduplication
  STRING_SIMILARITY_THRESHOLD: 0.8,
  TIME_MATCH_THRESHOLD_MS: 60000, // 1 minute

  // Default durations
  DEFAULT_EVENT_DURATION_HOURS: 2,

  // Cache limits
  MAX_BLOCKS_PER_PAGE: 50,
} as const;

/**
 * Validate and transform request body into scraper configuration
 */
export function validateConfig(body: unknown): ScraperConfig {
  // Type guard and validate body structure
  const requestBody = body as Record<string, unknown>;

  // Validate URL
  if (!requestBody.url || typeof requestBody.url !== 'string') {
    throw new Error('URL is required and must be a string');
  }

  try {
    new URL(requestBody.url);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Build config from request body
  const config: ScraperConfig = {
    source: {
      url: requestBody.url,
      userAgent:
        (requestBody.userAgent as string) || process.env.SOURCE_USER_AGENT || 'ICS-Scraper/1.0',
      headers: (requestBody.headers as Record<string, string>) || {},
    },
    processing: {
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: ((requestBody.model as string) || 'claude-3-haiku-20240307') as
          | 'claude-3-haiku-20240307'
          | 'claude-3-sonnet-20240229'
          | 'claude-3-5-sonnet-20241022',
        maxContinuations:
          (requestBody.maxContinuations as number) ||
          parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
      },
      batchSize: (requestBody.batchSize as number) || parseInt(process.env.BATCH_SIZE || '50', 10),
      retry: {
        maxAttempts:
          (requestBody.retryAttempts as number) || parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
    },
    ics: {
      calendarName: (requestBody.calendarName as string) || 'Scraped Events',
      timezone:
        (requestBody.timezone as string) || process.env.DEFAULT_TIMEZONE || 'America/New_York',
      // detectTimezone: requestBody.detectTimezone !== false && (process.env.DETECT_TIMEZONE !== 'false')
    },
  };

  // Validate required fields
  if (!config.processing?.ai?.apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  if (config.processing?.batchSize && config.processing.batchSize < 1) {
    throw new Error('Batch size must be at least 1');
  }

  if (config?.processing?.retry?.maxAttempts && config.processing.retry.maxAttempts < 0) {
    throw new Error('Retry attempts cannot be negative');
  }

  return config;
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): Partial<ScraperConfig> {
  return {
    processing: {
      batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
      retry: {
        maxAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      ai: {
        model: 'claude-3-haiku-20240307',
        maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      },
    },
    ics: {
      timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
      // detectTimezone: process.env.DETECT_TIMEZONE !== 'false'
    },
  };
}
