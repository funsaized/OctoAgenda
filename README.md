# OctoAgenda - AI-Powered Event Scraper → iCal

An intelligent web scraping tool that extracts event data from any webpage and generates ICS calendar files using AI-powered content extraction with Firecrawl and Claude.

## Features

- 🤖 **AI-Powered Extraction**: Uses Claude Haiku 4.5 with streaming for intelligent event extraction from any webpage
- 🔥 **Firecrawl Integration**: Advanced web scraping with markdown conversion for optimal content extraction
- 📅 **ICS Calendar Generation**: Automatically generates standard ICS calendar files compatible with all calendar apps
- ⚡ **Streaming API**: Real-time progress updates via async generators for immediate event availability
- ⏰ **Scheduled Jobs**: Automated scraping with Vercel Cron (weekly on Wednesdays at 4 AM)
- 🌍 **Intelligent Timezone Detection**: Automatic timezone detection and conversion with fallback mechanisms
- 🔒 **Security Headers**: Built-in security with CORS, XSS protection, and content security policies
- ♻️ **Smart Continuation**: Handles large event lists with automatic AI continuation up to 10 iterations
- 🎯 **Duplicate Detection**: Advanced deduplication to prevent duplicate events in output

## Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript 5** - Type-safe development
- **Claude Haiku 4.5** - Anthropic's latest AI model for event extraction (64K token context)
- **Firecrawl** - Advanced web scraping and markdown conversion
- **ical-generator** - ICS file generation
- **date-fns-tz** - Timezone handling and conversion
- **Zod** - Runtime type validation
- **React Hook Form** - Form handling

## API Endpoints

### POST `/api/scrape`

Scrape events from a URL and generate ICS file.

**Request:**

```json
{
  "url": "https://example.com/events",
  "timezone": "America/New_York",
  "calendarName": "My Events"
}
```

**Response:** 
- JSON with events array and ICS content
- Or direct ICS file download with appropriate headers

**Example:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/events", "timezone": "America/Chicago"}'
```

### GET `/api/cron`

Scheduled endpoint for automated scraping (Vercel Cron - Wednesdays 4 AM UTC).

**Authentication:** Requires `CRON_SECRET` header or query parameter matching environment variable.

**Response:** JSON with scraping results and event count.

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude AI ([Get API key](https://console.anthropic.com/))
- `FIRECRAWL_API_KEY` - Your Firecrawl API key for web scraping ([Get API key](https://firecrawl.dev/))
- `SOURCE_URL` - Default URL to scrape (used by cron job)

### Optional

- `CRON_SECRET` - Secret for cron job authentication (recommended for production)
- `MAX_CONTINUATIONS` - Max AI continuation calls (default: 10, max 64K tokens per call)
- `DEFAULT_TIMEZONE` - Default timezone for events (default: America/New_York)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...
SOURCE_URL=https://example.com/events
CRON_SECRET=your-secret-here
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Test the API

**Basic scrape:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/events"}'
```

**With timezone:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/events", "timezone": "America/Los_Angeles"}'
```

## Deployment

### Vercel (Recommended)

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com/)
   - Import your repository
   - Add environment variables in project settings

3. **Configure Cron Job:**
   - Cron configuration is in `vercel.json`
   - Default: Wednesdays at 4 AM UTC (`0 4 * * 3`)
   - Modify schedule as needed

### Other Platforms

Standard Next.js app - deploy to any platform supporting Node.js 18+:
- **Netlify** - Add build command: `npm run build`
- **Railway** - Auto-detects Next.js
- **DigitalOcean App Platform** - Node.js app with build command
- **Self-hosted** - Run `npm run build && npm start`

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── scrape/          # Main scraping endpoint
│   │   └── cron/            # Scheduled scraping endpoint
│   ├── layout.tsx           # Root layout with metadata
│   ├── page.tsx             # Home page with form
│   └── globals.css          # Global styles
├── lib/
│   └── api/
│       ├── services/
│       │   ├── anthropic-ai.ts           # Claude AI streaming integration
│       │   ├── firecrawl-service.ts      # Firecrawl web scraping
│       │   ├── ics-generator.ts          # ICS file generation
│       │   └── scraper-orchestrator.ts   # Main orchestration logic
│       ├── types/
│       │   └── index.ts                  # TypeScript type definitions
│       └── utils/
│           ├── config.ts                 # Configuration management
│           └── performance.ts            # Performance monitoring
├── public/                  # Static assets
├── next.config.ts           # Next.js configuration
├── vercel.json              # Vercel deployment & cron config
└── package.json             # Dependencies
```

## How It Works

1. **Web Scraping**: Firecrawl fetches and converts webpage to clean markdown
2. **AI Extraction**: Claude Haiku 4.5 streams event data from markdown content
3. **Validation**: Events validated for required fields and proper date formats
4. **Timezone Handling**: Intelligent timezone detection and conversion
5. **ICS Generation**: Standard ICS file created with all event metadata
6. **Response**: Events returned as JSON or downloadable ICS file

## Event Schema

Each extracted event includes:

```typescript
{
  title: string;              // Event name (required)
  startTime: Date;            // Event start (required, local time)
  endTime: Date;              // Event end (defaults to startTime + 2h)
  location: string;           // Venue/address (defaults to "TBD")
  description: string;        // Event details
  timezone: string;           // IANA timezone (e.g., "America/New_York")
  organizer?: {               // Optional organizer info
    name: string;
    email?: string;
    phone?: string;
  };
  recurringRule?: string;     // RRULE format for recurring events
  url?: string;               // Event URL
}
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Error Handling

The application includes comprehensive error handling:

- **Network errors** - Retryable with exponential backoff
- **API rate limits** - Detected and reported with retry guidance
- **Invalid content** - Clear error messages with troubleshooting steps
- **Authentication failures** - API key validation with helpful messages
- **Timezone errors** - Fallback to default timezone with warnings

## Performance Optimization

- **Streaming responses** - Events available immediately as extracted
- **Smart continuation** - Handles 100+ events across multiple AI calls
- **Deduplication** - Prevents duplicate events in output
- **Efficient parsing** - Incremental JSON parsing for real-time updates
- **Edge runtime** - Fast response times with Vercel Edge Functions

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/snimmagadda1/ics-scraper/issues)
- **Discussions**: [GitHub Discussions](https://github.com/snimmagadda1/ics-scraper/discussions)

## Acknowledgments

- [Anthropic](https://anthropic.com/) - Claude AI API
- [Firecrawl](https://firecrawl.dev/) - Web scraping service
- [Vercel](https://vercel.com/) - Hosting and deployment
- [Next.js](https://nextjs.org/) - React framework
