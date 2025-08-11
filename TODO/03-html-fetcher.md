Create a TypeScript module for fetching HTML with these requirements:

1. Implement exponential backoff for retries (max 3 attempts)
2. Handle common HTTP errors (timeout, 404, 500, etc.)
3. Support custom headers and user agents
4. Implement request caching with configurable TTL
5. Add request/response logging for debugging
6. Handle both static HTML and JavaScript-rendered pages (using puppeteer-core if needed)

The module should export:
- fetchHTML(url: string, options?: FetchOptions): Promise<string>
- clearCache(): void
- Types for all options and responses

Include error handling that distinguishes between:
- Network errors (retry)
- Server errors (retry with backoff)
- Client errors (fail immediately)

Reference: Node.js Best Practices for HTTP requests