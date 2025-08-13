/**
 * Performance Optimization Utilities
 * Implements caching, batching, circuit breakers, and monitoring
 */

import { ScraperError, ErrorCode } from '@/lib/api/types/index';

/**
 * Circuit breaker state
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;

  /** Success threshold to close circuit */
  successThreshold: number;

  /** Timeout before attempting to close circuit (ms) */
  timeout: number;

  /** Monitor window size */
  monitoringWindow: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number[] = [];
  private successes = 0;
  private lastFailureTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new ScraperError(
          'Circuit breaker is OPEN',
          ErrorCode.RATE_LIMIT_EXCEEDED,
          { state: this.state },
          true
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = [];

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Remove old failures outside monitoring window
    const cutoff = now - this.config.monitoringWindow;
    this.failures = this.failures.filter(f => f > cutoff);

    if (this.failures.length >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures.length,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Performance metrics collection
 */
export class PerformanceMonitor {
  private metrics: Map<string, any[]> = new Map();

  startTimer(operation: string): () => number {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      this.recordMetric(operation, { duration, timestamp: new Date() });
      return duration;
    };
  }

  recordMetric(name: string, data: any): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(data);

    // Keep only last 100 metrics per operation
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }

  getMetrics(name?: string) {
    if (name) {
      return this.metrics.get(name) || [];
    }

    const allMetrics: Record<string, any> = {};
    for (const [key, values] of this.metrics.entries()) {
      allMetrics[key] = {
        count: values.length,
        latest: values[values.length - 1],
        average: this.calculateAverage(values, 'duration'),
        percentile95: this.calculatePercentile(values, 0.95, 'duration')
      };
    }

    return allMetrics;
  }

  private calculateAverage(values: any[], field: string): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + (val[field] || 0), 0);
    return sum / values.length;
  }

  private calculatePercentile(values: any[], percentile: number, field: string): number {
    if (values.length === 0) return 0;

    const sorted = values
      .map(v => v[field] || 0)
      .sort((a, b) => a - b);

    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index] || 0;
  }
}

/**
 * Smart chunking for AI API calls
 */
export function smartChunk(
  content: string,
  maxTokens: number = 3000,
  preserveBoundaries: boolean = true
): string[] {
  const avgCharsPerToken = 4;
  const maxChars = maxTokens * avgCharsPerToken;

  if (content.length <= maxChars) {
    return [content];
  }

  const chunks: string[] = [];

  if (preserveBoundaries) {
    // Split by paragraphs first
    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length <= maxChars) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // If single paragraph is too large, split by sentences
        if (paragraph.length > maxChars) {
          const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
          let sentenceChunk = '';

          for (const sentence of sentences) {
            if ((sentenceChunk + sentence).length <= maxChars) {
              sentenceChunk += sentence;
            } else {
              if (sentenceChunk) chunks.push(sentenceChunk);
              sentenceChunk = sentence;
            }
          }

          if (sentenceChunk) chunks.push(sentenceChunk);
        } else {
          currentChunk = paragraph;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  } else {
    // Simple character-based chunking
    for (let i = 0; i < content.length; i += maxChars) {
      chunks.push(content.substring(i, i + maxChars));
    }
  }

  return chunks;
}

/**
 * Batch processor with rate limiting
 */
export class BatchProcessor<T, R> {
  constructor(
    private batchSize: number = 5,
    private delayBetweenBatches: number = 1000,
    // private _maxConcurrency: number = 3
  ) {}

  async process(
    items: T[],
    processor: (item: T) => Promise<R>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);

      // Process batch with concurrency limit
      const batchPromises = batch.map(item =>
        processor(item).catch(error => {
          console.error('Batch item failed:', error);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null) as R[]);

      // Report progress
      onProgress?.(Math.min(i + this.batchSize, items.length), items.length);

      // Delay between batches (except for last batch)
      if (i + this.batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }

    return results;
  }
}

/**
 * Memory usage monitoring
 */
export class MemoryMonitor {
  private initialUsage: NodeJS.MemoryUsage;

  constructor() {
    this.initialUsage = process.memoryUsage();
  }

  getCurrentUsage() {
    return process.memoryUsage();
  }

  getUsageDelta() {
    const current = this.getCurrentUsage();

    return {
      rss: current.rss - this.initialUsage.rss,
      heapUsed: current.heapUsed - this.initialUsage.heapUsed,
      heapTotal: current.heapTotal - this.initialUsage.heapTotal,
      external: current.external - this.initialUsage.external
    };
  }

  checkMemoryPressure(): { pressure: boolean; usage: number } {
    const usage = this.getCurrentUsage();
    const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    return {
      pressure: usagePercent > 80,
      usage: usagePercent
    };
  }
}

/**
 * Performance optimization recommendations
 */
export function analyzePerformance(metrics: any): string[] {
  const recommendations: string[] = [];

  // Check API call efficiency
  if (metrics.apiCalls?.average > 2000) {
    recommendations.push('Consider reducing API call frequency or batch size');
  }

  // Check token usage
  if (metrics.tokenUsage?.average > 5000) {
    recommendations.push('Implement better content filtering to reduce token usage');
  }

  // Check memory usage
  if (metrics.memoryUsage?.pressure) {
    recommendations.push('Optimize memory usage or increase function memory allocation');
  }

  // Check processing time
  if (metrics.processingTime?.average > 30000) {
    recommendations.push('Consider parallel processing or caching improvements');
  }

  return recommendations;
}

/**
 * Cost optimization utilities
 */
export class CostOptimizer {
  private tokenUsageHistory: number[] = [];
  private costHistory: number[] = [];

  recordTokenUsage(inputTokens: number, outputTokens: number): void {
    this.tokenUsageHistory.push(inputTokens + outputTokens);

    // Calculate cost (Haiku pricing)
    const cost = (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25;
    this.costHistory.push(cost);

    // Keep only last 1000 records
    if (this.tokenUsageHistory.length > 1000) {
      this.tokenUsageHistory.splice(0, 100);
      this.costHistory.splice(0, 100);
    }
  }

  getAverageCost(): number {
    if (this.costHistory.length === 0) return 0;
    return this.costHistory.reduce((a, b) => a + b, 0) / this.costHistory.length;
  }

  getTotalCost(): number {
    return this.costHistory.reduce((a, b) => a + b, 0);
  }

  getTokenEfficiency(): number {
    if (this.tokenUsageHistory.length === 0) return 0;
    return this.tokenUsageHistory.reduce((a, b) => a + b, 0) / this.tokenUsageHistory.length;
  }

  shouldOptimize(): boolean {
    const avgCost = this.getAverageCost();
    const avgTokens = this.getTokenEfficiency();

    // Suggest optimization if cost is high or token usage is inefficient
    return avgCost > 0.01 || avgTokens > 8000;
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Global cost optimizer instance
 */
export const costOptimizer = new CostOptimizer();

/**
 * Create circuit breaker for external services
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    monitoringWindow: 300000
  };

  return new CircuitBreaker({ ...defaultConfig, ...config });
}

/**
 * Debounce function for rate limiting
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout;
  let resolvePromise: (value: ReturnType<T>) => void;
  let rejectPromise: (error: any) => void;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      clearTimeout(timeoutId);
      resolvePromise = resolve;
      rejectPromise = reject;

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolvePromise(result);
        } catch (error) {
          rejectPromise(error);
        }
      }, delay);
    });
  };
}

/**
 * Memoization decorator
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl: number = 300000 // 5 minutes
): T {
  const cache = new Map<string, { value: any; expiry: number }>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    const now = Date.now();

    // Check cache
    const cached = cache.get(key);
    if (cached && now < cached.expiry) {
      return cached.value;
    }

    // Execute function
    const result = fn(...args);

    // Cache result
    cache.set(key, {
      value: result,
      expiry: now + ttl
    });

    // Clean expired entries periodically
    if (cache.size > 100) {
      for (const [k, v] of cache.entries()) {
        if (now >= v.expiry) {
          cache.delete(k);
        }
      }
    }

    return result;
  }) as T;
}

/**
 * Lazy loading utility
 */
export function lazy<T>(factory: () => T): () => T {
  let instance: T;
  let initialized = false;

  return (): T => {
    if (!initialized) {
      instance = factory();
      initialized = true;
    }
    return instance;
  };
}

/**
 * Resource pool for managing expensive resources
 */
export class ResourcePool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private waiting: Array<{ resolve: (resource: T) => void; reject: (error: Error) => void }> = [];

  constructor(
    private factory: () => Promise<T>,
    private destroyer: (resource: T) => Promise<void>,
    private maxSize: number = 10,
    private minSize: number = 2
  ) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    for (let i = 0; i < this.minSize; i++) {
      try {
        const resource = await this.factory();
        this.available.push(resource);
      } catch (error) {
        console.error('Failed to initialize resource pool:', error);
      }
    }
  }

  async acquire(): Promise<T> {
    // Check if resource is available
    if (this.available.length > 0) {
      const resource = this.available.pop()!;
      this.inUse.add(resource);
      return resource;
    }

    // Create new resource if under limit
    if (this.inUse.size < this.maxSize) {
      try {
        const resource = await this.factory();
        this.inUse.add(resource);
        return resource;
      } catch (error) {
        throw new Error(`Failed to create resource: ${error}`);
      }
    }

    // Wait for resource to become available
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        const index = this.waiting.findIndex(w => w.resolve === resolve);
        if (index >= 0) {
          this.waiting.splice(index, 1);
          reject(new Error('Resource acquisition timeout'));
        }
      }, 30000);
    });
  }

  release(resource: T): void {
    if (!this.inUse.has(resource)) {
      return;
    }

    this.inUse.delete(resource);

    // Serve waiting request if any
    if (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      this.inUse.add(resource);
      waiter.resolve(resource);
    } else {
      this.available.push(resource);
    }
  }

  async destroy(): Promise<void> {
    // Destroy all available resources
    for (const resource of this.available) {
      try {
        await this.destroyer(resource);
      } catch (error) {
        console.error('Failed to destroy resource:', error);
      }
    }

    this.available = [];
    this.inUse.clear();

    // Reject all waiting requests
    for (const waiter of this.waiting) {
      waiter.reject(new Error('Resource pool destroyed'));
    }
    this.waiting = [];
  }

  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waiting.length,
      total: this.available.length + this.inUse.size
    };
  }
}
