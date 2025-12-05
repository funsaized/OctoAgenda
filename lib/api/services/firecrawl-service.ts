/**
 * Firecrawl Service
 * Handles web scraping and markdown conversion using Firecrawl API
 */
import { ErrorCode, ScraperError } from '@/lib/api/types/index';
import Firecrawl from '@mendable/firecrawl-js';

/**
 * Firecrawl scrape result
 */
export interface FirecrawlResult {
  /** Markdown content */
  markdown: string;

  /** Page metadata */
  metadata: {
    title?: string;
    description?: string;
    language?: string;
    sourceURL: string;
    statusCode: number;
  };

  /** Raw HTML (if requested) */
  html?: string;

  /** Links found on the page */
  links?: string[];
}

/**
 * Firecrawl configuration options
 */
export interface FirecrawlOptions {
  /** Additional formats to retrieve */
  formats?: ('markdown' | 'html' | 'links' | 'screenshot')[];

  /** Wait time after page load (ms) */
  waitAfterLoad?: number;

  /** Request timeout (ms) */
  timeout?: number;

  /** Whether to use cache */
  useCache?: boolean;
}

/**
 * Initialize Firecrawl client
 */
function createFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    throw new ScraperError(
      'FIRECRAWL_API_KEY environment variable is required',
      ErrorCode.CONFIGURATION_ERROR,
      { missingVar: 'FIRECRAWL_API_KEY' },
      false
    );
  }

  return new Firecrawl({ apiKey });
}

/**
 * Scrape a URL and get markdown content using Firecrawl
 */
export async function scrapeWithFirecrawl(
  url: string,
  options: FirecrawlOptions = {}
): Promise<FirecrawlResult> {
  try {
    const client = createFirecrawlClient();

    const formats = options.formats || ['markdown'];
    if (!formats.includes('markdown')) {
      formats.push('markdown');
    }

    const result = await client.scrape(url, {
      formats: formats as unknown as ('markdown' | 'html' | 'links' | 'screenshot')[],
      timeout: options.timeout,
      waitFor: options.waitAfterLoad,
    });

    // Check if scrape was successful
    if (!result) {
      throw new ScraperError(
        'Firecrawl scrape failed - no result returned',
        ErrorCode.NETWORK_ERROR,
        {
          url,
        },
        true
      );
    }

    const data = result;

    if (!data || !data.markdown) {
      throw new ScraperError(
        'No markdown content returned from Firecrawl',
        ErrorCode.INVALID_HTML,
        {
          url,
          hasData: !!data,
          dataKeys: data ? Object.keys(data) : [],
        },
        false
      );
    }

    return {
      markdown: data.markdown,
      metadata: {
        title: data.metadata?.title,
        description: data.metadata?.description,
        language: data.metadata?.language || 'en',
        sourceURL: data.metadata?.sourceURL || url,
        statusCode: data.metadata?.statusCode || 200,
      },
      html: data.html,
      links: data.links,
    };
  } catch (error) {
    const err = error as Error & { status?: number };

    // Handle Firecrawl-specific errors
    if (err.status === 401 || err.status === 403) {
      throw new ScraperError(
        'Firecrawl authentication failed - check API key',
        ErrorCode.CONFIGURATION_ERROR,
        {
          url,
          status: err.status,
          message: err.message,
        },
        false
      );
    }

    if (err.status === 429) {
      throw new ScraperError(
        'Firecrawl rate limit exceeded',
        ErrorCode.RATE_LIMIT_EXCEEDED,
        {
          url,
          message: err.message,
        },
        true
      );
    }

    if (err.status === 402) {
      throw new ScraperError(
        'Firecrawl credits exhausted - upgrade plan or add credits',
        ErrorCode.CONFIGURATION_ERROR,
        {
          url,
          message: err.message,
        },
        false
      );
    }

    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(
      `Firecrawl scrape failed: ${err.message}`,
      ErrorCode.NETWORK_ERROR,
      {
        url,
        originalError: err.message,
        stack: err.stack,
      },
      true
    );
  }
}

/**
 * Simple fetch function that returns just the markdown content
 * Compatible with existing code that expects a string
 */
export async function fetchMarkdownWithFirecrawl(url: string): Promise<string> {
  const result = await scrapeWithFirecrawl(url, {
    formats: ['markdown'],
  });

  return result.markdown;
}
