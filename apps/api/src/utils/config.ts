import { ScraperConfig } from "../types/index.js";

/**
 * Validate scraper configuration
 */
export function validateConfig(config: ScraperConfig): string[] {
  const errors: string[] = [];

  // Validate source
  if (!config.source.url) {
    errors.push('Source URL is required');
  } else {
    try {
      new URL(config.source.url);
    } catch {
      errors.push('Invalid source URL');
    }
  }

  // Validate processing options
  if (config.processing) {
    if (!config.processing.ai?.apiKey && !process.env.ANTHROPIC_API_KEY) {
      errors.push('Anthropic API key is required');
    }

    if (config.processing.batchSize && config.processing.batchSize < 1) {
      errors.push('Batch size must be at least 1');
    }
  }

  return errors;
}
