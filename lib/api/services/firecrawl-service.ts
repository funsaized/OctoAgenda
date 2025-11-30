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
  console.log(`\n🔥 FIRECRAWL: Scraping ${url}`);

  try {
    const client = createFirecrawlClient();

    // Default to markdown format, add others if specified
    const formats = options.formats || ['markdown'];
    if (!formats.includes('markdown')) {
      formats.push('markdown');
    }

    console.log(`   📋 Requested formats: ${formats.join(', ')}`);

    // Call Firecrawl API
    const startTime = Date.now();
    const result = await client.scrape(url, {
      formats: formats as any,
      timeout: options.timeout,
      waitFor: options.waitAfterLoad,
    });

    const duration = Date.now() - startTime;
    console.log(`   ✅ Firecrawl scrape completed in ${duration}ms`);

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

    // Firecrawl returns data directly, not wrapped in {success, data}
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

    // Log content statistics
    console.log(`   📏 Markdown length: ${data.markdown.length.toLocaleString()} characters`);
    if (data.metadata) {
      console.log(`   📋 Page title: "${data.metadata.title || 'N/A'}"`);
      console.log(`   🌐 Language: ${data.metadata.language || 'unknown'}`);
      console.log(`   📊 Status code: ${data.metadata.statusCode || 'N/A'}`);
    }
    if (data.html) {
      console.log(`   📄 HTML length: ${data.html.length.toLocaleString()} characters`);
    }
    if (data.links) {
      console.log(`   🔗 Links found: ${data.links.length}`);
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
  } catch (error: any) {
    console.error(`   ❌ Firecrawl error: ${error.message}`);

    // Handle Firecrawl-specific errors
    if (error.status === 401 || error.status === 403) {
      throw new ScraperError(
        'Firecrawl authentication failed - check API key',
        ErrorCode.CONFIGURATION_ERROR,
        {
          url,
          status: error.status,
          message: error.message,
        },
        false
      );
    }

    if (error.status === 429) {
      throw new ScraperError(
        'Firecrawl rate limit exceeded',
        ErrorCode.RATE_LIMIT_EXCEEDED,
        {
          url,
          message: error.message,
        },
        true
      );
    }

    if (error.status === 402) {
      throw new ScraperError(
        'Firecrawl credits exhausted - upgrade plan or add credits',
        ErrorCode.CONFIGURATION_ERROR,
        {
          url,
          message: error.message,
        },
        false
      );
    }

    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(
      `Firecrawl scrape failed: ${error.message}`,
      ErrorCode.NETWORK_ERROR,
      {
        url,
        originalError: error.message,
        stack: error.stack,
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
