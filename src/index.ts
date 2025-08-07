/**
 * Main entry point for the ICS Event Scraper
 * Exports all public APIs and utilities
 */

// Core services
export { fetchHTML, clearCache, isURLAccessible } from './services/html-fetcher.js';
export { preprocessHTML, extractStructuredData, hasEventContent } from './services/content-preprocessor.js';
export { extractEvents, validateExtraction, batchExtractEvents } from './services/anthropic-ai.js';
export { 
  detectTimezone, 
  convertToTimezone, 
  normalizeToET,
  validateEventTimes,
  isValidTimezone,
  parseDateWithTimezone
} from './services/timezone-intelligence.js';
export { 
  generateICS, 
  generateSingleEventICS, 
  validateICS,
  getICSHeaders
} from './services/ics-generator.js';
export { 
  scrapeEvents, 
  createConfigFromEnv,
  validateConfig,
  scrapeMultipleSources
} from './services/scraper-orchestrator.js';

// Performance utilities
export {
  CircuitBreaker,
  PerformanceMonitor,
  MemoryMonitor,
  BatchProcessor,
  CostOptimizer,
  createCircuitBreaker,
  smartChunk,
  memoize,
  debounce,
  lazy
} from './utils/performance.js';

// Type definitions
export type {
  CalendarEvent,
  SourceConfiguration,
  CalendarConfiguration,
  ProcessingOptions,
  FetchOptions,
  ICSOptions,
  ScraperConfig,
  ScraperResult,
  ExtractedEventData,
  Result
} from './types/index.js';

export { ScraperError, ErrorCode } from './types/index.js';

// Version
export const VERSION = '1.0.0';

/**
 * Default export: main scraping function
 */
export { scrapeEvents as default } from './services/scraper-orchestrator.js';