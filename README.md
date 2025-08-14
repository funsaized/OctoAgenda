# OctoAgenda - AI Powered Event Scraper -> iCal

A tool that scrapes event data from web pages and generates ICS calendar files using intelligent content extraction.

## Features

- 🤖 **AI-Powered Extraction**: Uses Claude AI to intelligently extract event information from web pages
- 📅 **ICS Calendar Generation**: Automatically generates standard ICS calendar files
- ⚡ **Edge Runtime**: Optimized for fast execution with Vercel Edge Functions
- 🔄 **Streaming API**: Real-time progress updates via Server-Sent Events
- ⏰ **Scheduled Jobs**: Automated scraping with cron jobs
- 🌍 **Timezone Support**: Intelligent timezone detection and conversion
- 🔒 **Security Headers**: Built-in security with proper CORS and headers

## API Endpoints

### POST `/api/scrape`

Scrape events from a URL and generate ICS file.

**Request:**

```json
{
  "url": "https://example.com/events",
  "batchSize": 50,
  "retryAttempts": 3,
  "timezone": "America/New_York",
  "calendarName": "My Events"
}
```

**Response:** JSON with events and ICS content or direct ICS file download.

### POST `/api/stream-scrape`

Streaming version with real-time progress updates.

**Response:** Server-Sent Events stream with progress updates.

### GET `/api/cron`

Scheduled endpoint for automated scraping (Vercel Cron).

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude AI
- `SOURCE_URL` - Default URL to scrape (used by cron job)

### Optional

- `CRON_SECRET` - Secret for cron job authentication
- `BATCH_SIZE` - Number of events to process per batch (default: 50)
- `RETRY_ATTEMPTS` - Number of retry attempts (default: 3)
- `CACHE_TTL` - Cache time-to-live in milliseconds (default: 3600000)
- `CACHE_MAX_SIZE` - Maximum cache size (default: 50)
- `DEFAULT_TIMEZONE` - Default timezone (default: America/New_York)
- `DETECT_TIMEZONE` - Enable timezone detection (default: true)
- `MAX_CONTINUATIONS` - Max AI continuations (default: 10)

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env.local
   # Add your ANTHROPIC_API_KEY and SOURCE_URL
   ```

3. **Run development server:**

   ```bash
   npm run dev
   ```

4. **Test the API:**
   ```bash
   curl -X POST http://localhost:3000/api/scrape \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/events"}'
   ```

## Deployment

### Vercel (Recommended)

1. **Connect to Vercel and deploy:**

   ```bash
   git push origin main
   ```

2. **Set environment variables in Vercel dashboard**

### Other Platforms

Standard Next.js app - can be deployed anywhere Node.js is supported.

## Project Structure

```
├── app/
│   ├── api/           # API routes
│   ├── globals.css    # Global styles
│   ├── layout.tsx     # Root layout
│   └── page.tsx       # Home page
├── lib/
│   └── api/           # API logic
│       ├── services/  # Core services
│       ├── types/     # TypeScript types
│       └── utils/     # Utility functions
├── public/            # Static assets
├── next.config.ts     # Next.js configuration
├── vercel.json        # Vercel deployment config
└── package.json       # Dependencies
```

## License

MIT License
