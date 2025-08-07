/**
 * HTML Fetcher Service
 * Handles fetching HTML content with retry logic, caching, and error handling
 */

import fetch, { Response } from 'node-fetch';
import pRetry from 'p-retry';
import { 
  FetchOptions, 
  ScraperError, 
  ErrorCode, 
  Result,
  CacheConfiguration 
} from '../types/index.js';

// Simple in-memory cache implementation
interface CacheEntry {
  content: string;
  timestamp: number;
  ttl: number;
}

class HTMLCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfiguration;

  constructor(config: CacheConfiguration) {
    this.config = config;
  }

  get(key: string): string | null {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;

    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  set(key: string, content: string, ttl?: number): void {
    if (!this.config.enabled) return;

    const maxSize = this.config.maxSize || 100;
    if (this.cache.size >= maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      ttl: ttl || this.config.ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    if (!this.config.enabled) return false;
    return this.get(key) !== null;
  }
}

// Default cache configuration
const defaultCacheConfig: CacheConfiguration = {
  enabled: true,
  ttl: 3600,
  maxSize: 100,
  storage: 'memory'
};

// Global cache instance
let cacheInstance: HTMLCache | null = null;

/**
 * Initialize the cache with configuration
 */
export function initializeCache(config: CacheConfiguration = defaultCacheConfig): void {
  cacheInstance = new HTMLCache(config);
}

/**
 * Get or create cache instance
 */
function getCache(): HTMLCache {
  if (!cacheInstance) {
    initializeCache();
  }
  return cacheInstance!;
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  const cache = getCache();
  cache.clear();
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (error instanceof ScraperError) {
    return error.retryable;
  }

  // Network errors are generally retryable
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET') {
    return true;
  }

  // Check if it's a 5xx server error
  if (error.statusCode && error.statusCode >= 500) {
    return true;
  }

  return false;
}

/**
 * Create a cache key from URL and options
 */
function createCacheKey(url: string, options?: FetchOptions): string {
  const parts = [url];
  
  if (options?.headers) {
    parts.push(JSON.stringify(options.headers));
  }
  
  if (options?.userAgent) {
    parts.push(options.userAgent);
  }

  return parts.join('::');
}

/**
 * Validate HTTP response
 */
async function validateResponse(response: Response, url: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const statusCode = response.status;
  const statusText = response.statusText;

  if (statusCode === 404) {
    throw new ScraperError(
      `Page not found: ${url}`,
      ErrorCode.HTTP_NOT_FOUND,
      { url, statusCode },
      false
    );
  }

  if (statusCode >= 400 && statusCode < 500) {
    throw new ScraperError(
      `Client error: ${statusCode} ${statusText}`,
      ErrorCode.HTTP_CLIENT_ERROR,
      { url, statusCode, statusText },
      false
    );
  }

  if (statusCode >= 500) {
    throw new ScraperError(
      `Server error: ${statusCode} ${statusText}`,
      ErrorCode.HTTP_SERVER_ERROR,
      { url, statusCode, statusText },
      true
    );
  }

  throw new ScraperError(
    `Unexpected response: ${statusCode} ${statusText}`,
    ErrorCode.NETWORK_ERROR,
    { url, statusCode, statusText },
    true
  );
}

/**
 * Fetch HTML with a single attempt (used by retry logic)
 */
async function fetchHTMLAttempt(
  url: string, 
  options?: FetchOptions
): Promise<string> {
  const timeout = options?.timeout || 30000;
  const userAgent = options?.userAgent || 
    'Mozilla/5.0 (compatible; ICS-Scraper/1.0; +https://github.com/yourusername/ics-scraper)';

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    ...options?.headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: options?.followRedirects !== false ? 'follow' : 'manual'
    });

    clearTimeout(timeoutId);

    await validateResponse(response, url);

    const html = await response.text();

    if (!html || html.trim().length === 0) {
      throw new ScraperError(
        'Empty response received',
        ErrorCode.INVALID_HTML,
        { url },
        true
      );
    }

    return html;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error instanceof ScraperError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new ScraperError(
        `Request timeout after ${timeout}ms`,
        ErrorCode.TIMEOUT,
        { url, timeout },
        true
      );
    }

    if (error.code === 'ENOTFOUND') {
      throw new ScraperError(
        `DNS lookup failed for ${url}`,
        ErrorCode.DNS_FAILURE,
        { url },
        false
      );
    }

    throw new ScraperError(
      `Network error: ${error.message}`,
      ErrorCode.NETWORK_ERROR,
      { url, originalError: error.message },
      true
    );
  }
}

/**
 * Main function to fetch HTML with retry logic and caching
 */
export async function fetchHTML(
  url: string, 
  options?: FetchOptions
): Promise<string> {
  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new ScraperError(
      `Invalid URL: ${url}`,
      ErrorCode.CONFIGURATION_ERROR,
      { url },
      false
    );
  }

  // Check cache first
  const cache = getCache();
  const cacheKey = options?.cacheKey || createCacheKey(url, options);
  
  if (options?.useCache !== false) {
    const cachedContent = cache.get(cacheKey);
    if (cachedContent) {
      console.log(`Cache hit for ${url}`);
      return cachedContent;
    }
  }

  console.log(`Fetching HTML from ${url}`);

  // Configure retry options
  const retryOptions = {
    retries: options?.retry?.maxAttempts || 3,
    minTimeout: options?.retry?.initialDelay || 1000,
    maxTimeout: options?.retry?.maxDelay || 30000,
    factor: options?.retry?.backoffMultiplier || 2,
    onFailedAttempt: (error: any) => {
      console.log(
        `Attempt ${error.attemptNumber} failed for ${url}. ` +
        `${error.retriesLeft} retries left. Error: ${error.message}`
      );
    },
    shouldRetry: (error: any) => isRetryableError(error)
  };

  try {
    const html = await pRetry(
      () => fetchHTMLAttempt(url, options),
      retryOptions
    );

    // Cache the successful result
    if (options?.useCache !== false) {
      cache.set(cacheKey, html);
    }

    return html;
  } catch (error: any) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(
      `Failed to fetch HTML after ${retryOptions.retries} attempts: ${error.message}`,
      ErrorCode.NETWORK_ERROR,
      { url, originalError: error.message },
      false
    );
  }
}

/**
 * Fetch multiple URLs in parallel with rate limiting
 */
export async function fetchMultipleHTML(
  urls: string[],
  options?: FetchOptions & { concurrency?: number }
): Promise<Result<string>[]> {
  const concurrency = options?.concurrency || 3;
  const results: Result<string>[] = [];
  
  // Process URLs in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchPromises = batch.map(async (url) => {
      try {
        const html = await fetchHTML(url, options);
        return { success: true as const, data: html };
      } catch (error) {
        return { 
          success: false as const, 
          error: error instanceof ScraperError ? error : 
            new ScraperError(
              `Unknown error: ${error}`,
              ErrorCode.INTERNAL_ERROR,
              { url },
              false
            )
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches to avoid rate limiting
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Check if a URL is accessible
 */
export async function isURLAccessible(
  url: string,
  options?: FetchOptions
): Promise<boolean> {
  try {
    await fetchHTML(url, { 
      ...options, 
      retry: { 
        maxAttempts: 1,
        initialDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1 
      } 
    });
    return true;
  } catch {
    return false;
  }
}

// Export types for external use
export type { FetchOptions, CacheConfiguration };
export { ScraperError, ErrorCode } from '../types/index.js';