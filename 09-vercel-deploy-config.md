Create the main Vercel serverless function at api/sync-events.ts that:

1. Implements proper Vercel handler signature:
   - Supports GET (manual trigger) and POST (webhook)
   - CORS configuration for browser access
   - Request validation and sanitization

2. Orchestrates the entire pipeline:
   - Fetch HTML from SOURCE_URL
   - Preprocess and chunk content
   - Extract events using Claude Haiku
   - Generate ICS files
   - Upload to configured calendar

3. Implements:
   - Streaming responses for long operations
   - Progress tracking via SSE or WebSocket
   - Graceful shutdown on timeout (10s limit)
   - Error aggregation and reporting

4. Includes monitoring:
   - Execution time tracking
   - Success/failure metrics
   - Cost tracking for API calls
   - Structured logging (JSON)

5. Configuration via environment:
   - Runtime validation of env vars
   - Feature flags for optional steps
   - Dry-run mode for testing

Include OpenAPI specification for the endpoint.