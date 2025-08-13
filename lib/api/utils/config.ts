import { ScraperConfig } from '@/lib/api/types/index';

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
      userAgent: (requestBody.userAgent as string) || process.env.SOURCE_USER_AGENT || 'ICS-Scraper/1.0',
      headers: (requestBody.headers as Record<string, string>) || {}
    },
    processing: {
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: ((requestBody.model as string) || 'claude-3-haiku-20240307') as 'claude-3-haiku-20240307' | 'claude-3-sonnet-20240229' | 'claude-3-5-sonnet-20241022',
        maxContinuations: (requestBody.maxContinuations as number) || parseInt(process.env.MAX_CONTINUATIONS || '10', 10)
      },
      batchSize: (requestBody.batchSize as number) || parseInt(process.env.BATCH_SIZE || '50', 10),
      retry: {
        maxAttempts: (requestBody.retryAttempts as number) || parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },
    ics: {
      calendarName: (requestBody.calendarName as string) || 'Scraped Events',
      timezone: (requestBody.timezone as string) || process.env.DEFAULT_TIMEZONE || 'America/New_York',
      // detectTimezone: requestBody.detectTimezone !== false && (process.env.DETECT_TIMEZONE !== 'false')
    }
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
        backoffMultiplier: 2
      },
      ai: {
        model: 'claude-3-haiku-20240307',
        maxContinuations: parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      }
    },
    ics: {
      timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
      // detectTimezone: process.env.DETECT_TIMEZONE !== 'false'
    }
  };
}
