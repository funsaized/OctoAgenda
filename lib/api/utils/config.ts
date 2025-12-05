import { ScraperConfig } from '@/lib/api/types/index';

/**
 * Validate and transform request body into scraper configuration
 */
export function validateConfig(body: unknown): ScraperConfig {
  const requestBody = body as Record<string, unknown>;

  if (!requestBody.url || typeof requestBody.url !== 'string') {
    throw new Error('URL is required and must be a string');
  }

  try {
    new URL(requestBody.url);
  } catch {
    throw new Error('Invalid URL format');
  }

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
        model: 'claude-haiku-4-5-20251001',
        maxContinuations:
          (requestBody.maxContinuations as number) ||
          parseInt(process.env.MAX_CONTINUATIONS || '10', 10),
      },
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
    },
  };

  if (!config.processing?.ai?.apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  if (config?.processing?.retry?.maxAttempts && config.processing.retry.maxAttempts < 0) {
    throw new Error('Retry attempts cannot be negative');
  }

  return config;
}
