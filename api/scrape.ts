/**
 * Main scraping API endpoint
 * Handles HTTP requests to scrape events and generate ICS files
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  scrapeEvents, 
  validateConfig,
  ScraperConfig 
} from '../src/services/scraper-orchestrator.js';
import { initializeAnthropic } from '../src/services/anthropic-ai.js';
import { initializeCache } from '../src/services/html-fetcher.js';
import { getICSHeaders } from '../src/services/ics-generator.js';
import { ScraperError, ErrorCode } from '../src/types/index.js';

/**
 * Initialize services
 */
function initializeServices(): void {
  // Initialize AI client
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    initializeAnthropic({
      apiKey,
      model: 'claude-3-haiku-20240307'
    });
  }
  
  // Initialize cache
  initializeCache({
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
    maxSize: 100,
    storage: 'memory'
  });
}

/**
 * Main handler for scraping requests
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Initialize services
  initializeServices();
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only accept GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET and POST methods are supported'
    });
    return;
  }
  
  try {
    // Get configuration
    const config = await getConfig(req);
    
    // Validate configuration
    const errors = validateConfig(config);
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Invalid configuration',
        errors
      });
      return;
    }
    
    // Log the scraping request
    console.log(`Scraping ${config.source.url}`);
    
    // Perform scraping
    const result = await scrapeEvents(config);
    
    // Check output format
    const format = req.query.format || req.body?.format || 'json';
    
    if (format === 'ics' && result.icsContent) {
      // Return ICS file
      const filename = req.query.filename || 'events.ics';
      const headers = getICSHeaders(filename as string);
      
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      res.status(200).send(result.icsContent);
    } else {
      // Return JSON response
      res.status(200).json({
        success: true,
        events: result.events,
        metadata: result.metadata,
        ics: result.icsContent ? {
          content: result.icsContent,
          downloadUrl: `/api/scrape?format=ics&url=${encodeURIComponent(config.source.url)}`
        } : undefined
      });
    }
  } catch (error) {
    console.error('Scraping error:', error);
    
    if (error instanceof ScraperError) {
      res.status(getErrorStatusCode(error.code)).json({
        error: error.code,
        message: error.message,
        details: error.details,
        retryable: error.retryable
      });
    } else {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      });
    }
  }
}

/**
 * Get configuration from request
 */
async function getConfig(req: VercelRequest): Promise<ScraperConfig> {
  // Check if URL is provided in query or body
  const url = req.query.url || req.body?.url || process.env.SOURCE_URL;
  
  if (!url) {
    throw new ScraperError(
      'No URL provided',
      ErrorCode.CONFIGURATION_ERROR,
      { message: 'Please provide a URL to scrape' },
      false
    );
  }
  
  // Build configuration
  const config: ScraperConfig = {
    source: {
      url: url as string,
      userAgent: (req.query.userAgent || req.body?.userAgent || process.env.SOURCE_USER_AGENT) as string,
      selectors: req.body?.selectors,
      headers: req.body?.headers,
      timeout: req.body?.timeout ? parseInt(req.body.timeout as string, 10) : undefined
    },
    processing: {
      batchSize: req.body?.batchSize ? parseInt(req.body.batchSize, 10) : 5,
      timezone: {
        default: (req.query.timezone || req.body?.timezone || process.env.DEFAULT_TIMEZONE || 'America/New_York') as string,
        autoDetect: req.body?.autoDetectTimezone !== false
      },
      ai: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-haiku-20240307'
      },
      cache: {
        enabled: req.query.useCache !== 'false',
        ttl: 3600
      },
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    },
    ics: {
      calendarName: (req.query.calendarName || req.body?.calendarName || 'Scraped Events') as string,
      includeAlarms: req.query.includeAlarms !== 'false',
      method: req.body?.inviteMode ? 'REQUEST' : 'PUBLISH'
    }
  };
  
  return config;
}

/**
 * Get HTTP status code for error
 */
function getErrorStatusCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.CONFIGURATION_ERROR:
    case ErrorCode.INVALID_EVENT_DATA:
    case ErrorCode.INVALID_DATE_FORMAT:
    case ErrorCode.MISSING_REQUIRED_FIELD:
      return 400;
    
    case ErrorCode.HTTP_NOT_FOUND:
      return 404;
    
    case ErrorCode.AI_RATE_LIMIT:
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.TIMEOUT:
    case ErrorCode.HTTP_SERVER_ERROR:
    case ErrorCode.AI_API_ERROR:
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}