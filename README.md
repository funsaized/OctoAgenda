# ICS Event Scraper Monorepo

A Turborepo-powered monorepo containing a Next.js frontend and Vercel serverless functions for AI-powered event extraction and ICS calendar generation.

## What's Inside

This Turborepo includes the following packages/apps:

### Apps

- `@repo/web`: A [Next.js](https://nextjs.org/) app (frontend)
- `@repo/api`: Vercel serverless functions for event scraping and ICS generation

### Packages

- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo
- `@repo/eslint-config`: ESLint configurations

## Features

### API Features (@repo/api)
- 🤖 **AI-Powered Extraction**: Uses Anthropic's Claude Haiku model with intelligent continuation handling
- 🔄 **Partial Response Recovery**: Advanced partial-JSON parsing handles truncated AI responses
- 🛡️ **Robust Error Recovery**: Preserves successfully extracted events even during connection errors
- 🌐 **Smart Web Scraping**: Handles static and dynamic content with retry logic and caching
- 🕐 **Timezone Intelligence**: Automatic timezone detection and conversion with DST awareness
- 📅 **ICS Generation**: RFC-compliant calendar file generation with recurring event support
- ⚡ **Serverless Architecture**: Runs on Vercel with automatic scaling
- 🔄 **Scheduled Execution**: Automated daily scraping via cron jobs
- 📊 **Performance Monitoring**: Built-in metrics, caching, and circuit breakers

### Frontend Features (@repo/web)
- ⚡ **Next.js 15**: Latest Next.js with App Router
- 🎨 **Tailwind CSS**: Utility-first CSS framework
- 📝 **TypeScript**: Full type safety
- 🔍 **ESLint**: Code quality and consistency

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

#### API Configuration
Create `.env` file in the root directory:

```bash
# Required for API
ANTHROPIC_API_KEY=your_anthropic_api_key
SOURCE_URL=https://example.com/events

# Optional
DEFAULT_TIMEZONE=America/New_York
BATCH_SIZE=5
MAX_CONTINUATIONS=20
CACHE_TTL=3600
RETRY_ATTEMPTS=3
CALENDAR_ENDPOINT=
MONITORING_WEBHOOK=
```

### Development

```bash
# Run both frontend and API in development mode
npm run dev

# Run specific app
npm run dev --workspace=@repo/web
npm run dev --workspace=@repo/api
```

### Build

```bash
# Build all apps and packages
npm run build

# Build specific app
npm run build --workspace=@repo/web
npm run build --workspace=@repo/api
```

### Testing

```bash
# Run tests for all packages
npm run test

# Run tests for specific package
npm run test --workspace=@repo/api
```

### Linting

```bash
# Lint all packages
npm run lint

# Type check all packages
npm run type-check
```

## Project Structure

```
.
├── apps/
│   ├── api/                      # Vercel serverless functions
│   │   ├── api/                  # API routes
│   │   │   ├── scrape.ts        # Main scraping endpoint
│   │   │   ├── stream-scrape.ts # Streaming endpoint
│   │   │   └── cron.ts          # Scheduled execution
│   │   ├── src/                  # Core logic
│   │   │   ├── services/        # Business logic modules
│   │   │   ├── types/           # TypeScript definitions
│   │   │   └── utils/           # Utility functions
│   │   ├── tests/               # Test suite
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                      # Next.js frontend
│       ├── app/                  # App router pages
│       ├── public/              # Static assets
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── eslint-config/           # Shared ESLint configurations
│   └── typescript-config/       # Shared TypeScript configurations
│
├── package.json                 # Root package.json
├── turbo.json                   # Turborepo configuration
└── README.md                    # This file
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

**Example:**
```bash
# Get events as JSON
curl "https://your-deployment.vercel.app/api/scrape?url=https://example.com/events"

# Download ICS file
curl "https://your-deployment.vercel.app/api/scrape?url=https://example.com/events&format=ics"
```

### `/api/stream-scrape`

Streaming version of the scrape endpoint for real-time event extraction.

### `/api/cron`

Scheduled endpoint for automated scraping (runs daily at 6 AM UTC).

## Deployment

### Deploy to Vercel

```bash
# Deploy all apps
npm run deploy

# Deploy production
npm run deploy:prod
```

### Environment Variables on Vercel

Set the following environment variables in your Vercel project settings:

- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `SOURCE_URL`: Default URL to scrape (for cron jobs)
- Other optional variables as needed

## Turborepo Features

### Remote Caching

Turborepo can cache builds remotely. To enable:

```bash
npx turbo link
```

### Pipeline

The build pipeline is configured in `turbo.json`:

- `build`: Depends on upstream builds
- `dev`: Runs in parallel with no caching
- `lint`: Runs independently
- `test`: Depends on builds
- `type-check`: Runs independently

## Development with Turborepo

### Filtering

Run tasks for specific packages:

```bash
# Run build for only the API
npm run build -- --filter=@repo/api

# Run dev for only the web app
npm run dev -- --filter=@repo/web
```

### Parallel Execution

Turborepo automatically runs tasks in parallel when possible, respecting dependency constraints.

### Caching

Build outputs are cached locally (and remotely if configured) to speed up subsequent builds.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions, please open an issue on GitHub.