# ICS Event Scraper

Serverless event scraper that automatically extracts calendar events from web pages using AI and generates ICS calendar files.

## Features

- 🤖 **AI-Powered Extraction**: Uses Anthropic's Claude Haiku model for intelligent event detection
- 🌐 **Smart Web Scraping**: Handles static and dynamic content with retry logic and caching
- 🕐 **Timezone Intelligence**: Automatic timezone detection and conversion with DST awareness
- 📅 **ICS Generation**: RFC-compliant calendar file generation with recurring event support
- ⚡ **Serverless Architecture**: Runs on Vercel with automatic scaling
- 🔄 **Scheduled Execution**: Automated daily scraping via cron jobs
- 📊 **Performance Monitoring**: Built-in metrics, caching, and circuit breakers
- 🧪 **Comprehensive Testing**: 80%+ test coverage with integration tests

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `SOURCE_URL`: The web page URL to scrape events from

### 3. Deploy to Vercel

```bash
npm run deploy
```

### 4. Test the API

```bash
# Get events as JSON
curl "https://your-deployment.vercel.app/api/scrape?url=https://example.com/events"

# Download ICS file
curl "https://your-deployment.vercel.app/api/scrape?url=https://example.com/events&format=ics"
```

## API Endpoints

### `/api/scrape`

Extracts events from a web page and returns them as JSON or ICS.

**Parameters:**
- `url` (required): URL to scrape
- `format`: Response format (`json` | `ics`)
- `timezone`: Override timezone detection
- `calendarName`: Name for generated calendar
- `useCache`: Enable/disable caching (`true` | `false`)

**Example Response (JSON):**
```json
{
  "success": true,
  "events": [
    {
      "title": "Tech Conference 2024",
      "startTime": "2024-03-15T14:00:00.000Z",
      "endTime": "2024-03-15T18:00:00.000Z",
      "location": "San Francisco Convention Center",
      "description": "Annual technology conference",
      "timezone": "America/Los_Angeles"
    }
  ],
  "metadata": {
    "totalEvents": 1,
    "processedEvents": 1,
    "processingTime": 2500,
    "warnings": []
  }
}
```

### `/api/cron`

Scheduled endpoint for automated scraping (runs daily at 6 AM UTC).

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   Vercel Edge    │    │  Anthropic API  │
│   (User/Cron)   │───▶│   Function       │───▶│   (Claude AI)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │   Calendar Service   │
                    │   (CalDAV/ICS File)  │
                    └──────────────────────┘
```

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── scrape.ts          # Main scraping endpoint
│   └── cron.ts            # Scheduled execution
├── src/
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts       # Core interfaces and types
│   ├── services/          # Business logic modules
│   │   ├── html-fetcher.ts           # Web scraping with retries
│   │   ├── content-preprocessor.ts   # HTML cleaning and parsing
│   │   ├── anthropic-ai.ts          # AI event extraction
│   │   ├── timezone-intelligence.ts  # Timezone detection
│   │   ├── ics-generator.ts         # Calendar file generation
│   │   └── scraper-orchestrator.ts  # Service coordination
│   └── utils/             # Utility functions
│       └── performance.ts  # Performance optimization tools
├── tests/                 # Test suite
│   ├── fixtures/          # Test data
│   └── services/          # Service tests
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vercel.json           # Vercel deployment config
└── jest.config.js        # Testing configuration
```

## Service Architecture

### 1. HTML Fetcher (`src/services/html-fetcher.ts`)
- Exponential backoff retry logic
- Request caching with configurable TTL
- Support for custom headers and user agents
- Error classification (retryable vs. non-retryable)

### 2. Content Preprocessor (`src/services/content-preprocessor.ts`)
- HTML cleaning with Cheerio
- Event container detection using heuristics
- Structured data extraction (JSON-LD, Microdata)
- Smart content chunking for AI processing

### 3. AI Integration (`src/services/anthropic-ai.ts`)
- Claude 3 Haiku integration for cost efficiency
- Structured prompt engineering for event extraction
- Response validation and error handling
- Batch processing with rate limiting

### 4. Timezone Intelligence (`src/services/timezone-intelligence.ts`)
- City/state to timezone mapping
- Timezone abbreviation resolution
- DST awareness and transition handling
- Confidence-based timezone detection

### 5. ICS Generator (`src/services/ics-generator.ts`)
- RFC 5545 compliant calendar files
- Support for recurring events (RRULE)
- Attendee and organizer information
- Customizable alarms and reminders

### 6. Performance Optimization (`src/utils/performance.ts`)
- Circuit breaker pattern for external services
- Memory monitoring and pressure detection
- Cost tracking and optimization recommendations
- Batch processing with concurrency control

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

### Local Development

```bash
npm run dev
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | Required |
| `SOURCE_URL` | Default URL to scrape | Required |
| `DEFAULT_TIMEZONE` | Fallback timezone | `America/New_York` |
| `BATCH_SIZE` | AI processing batch size | `5` |
| `CACHE_TTL` | Cache duration (seconds) | `3600` |
| `RETRY_ATTEMPTS` | Max retry attempts | `3` |
| `CALENDAR_ENDPOINT` | CalDAV endpoint | Optional |
| `MONITORING_WEBHOOK` | Webhook for notifications | Optional |

### Source Configuration

Customize scraping behavior via request body:

```json
{
  "url": "https://example.com/events",
  "selectors": {
    "eventContainer": ".event-item",
    "title": "h3",
    "datetime": ".event-date",
    "location": ".event-location"
  },
  "headers": {
    "Authorization": "Bearer token"
  },
  "batchSize": 10,
  "timezone": "America/Los_Angeles"
}
```

## Performance

### Optimization Features

- **Content Pre-filtering**: Reduces AI API calls by 60-80%
- **Smart Caching**: HTTP response caching with configurable TTL
- **Batch Processing**: Processes multiple events efficiently
- **Circuit Breakers**: Prevents cascade failures
- **Memory Monitoring**: Tracks and optimizes memory usage

### Cost Optimization

- Uses Claude 3 Haiku for cost efficiency (~$0.001 per page)
- Intelligent content chunking to minimize tokens
- Regex fallback to reduce AI dependency
- Caching to avoid redundant API calls

### Performance Benchmarks

| Metric | Target | Typical |
|--------|--------|---------|
| Processing Time | <60s | ~15s |
| Memory Usage | <1GB | ~200MB |
| API Cost per Page | <$0.01 | ~$0.001 |
| Success Rate | >95% | ~98% |

## Monitoring

### Built-in Metrics

- Processing time and success rates
- AI token usage and costs
- Memory consumption patterns
- Error rates by category

### Webhook Notifications

Configure `MONITORING_WEBHOOK` to receive notifications:

```json
{
  "type": "success",
  "timestamp": "2024-03-15T10:00:00Z",
  "eventsFound": 5,
  "metadata": {
    "processingTime": 15000,
    "warnings": [],
    "source": "https://example.com/events"
  }
}
```

## Error Handling

The system handles various error scenarios:

- **Network errors**: Automatic retry with exponential backoff
- **AI API errors**: Circuit breaker and fallback to regex extraction
- **Parsing errors**: Graceful degradation with warning logs
- **Calendar errors**: Non-blocking failures with notification

## Contributing

### Adding New Event Sources

1. Test the scraper with your URL
2. Customize selectors if needed
3. Add timezone mapping for new locations
4. Update test fixtures

### Extending AI Prompts

1. Modify the system prompt in `src/services/anthropic-ai.ts`
2. Add validation for new fields
3. Update type definitions
4. Add corresponding tests

### Performance Improvements

1. Profile with the built-in performance monitor
2. Implement optimizations in `src/utils/performance.ts`
3. Add benchmarks to validate improvements
4. Update documentation

## Troubleshooting

### Common Issues

**No events extracted:**
- Check if the page contains event information
- Verify timezone detection is working
- Examine the AI extraction prompt relevance

**High API costs:**
- Enable content pre-filtering
- Adjust batch size and chunk size
- Use caching more aggressively

**Memory issues:**
- Increase Vercel function memory allocation
- Optimize content chunking strategy
- Monitor for memory leaks

### Debugging

Enable debug mode:
```bash
export DEBUG_MODE=true
export NODE_ENV=development
```

This will:
- Save HTML content to files
- Log AI prompts and responses
- Output detailed performance metrics
- Enable verbose error logging

## License

MIT License