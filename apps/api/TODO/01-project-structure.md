I need to create a Vercel serverless function in TypeScript that:
1. Fetches HTML from a configured events page
2. Uses Anthropic's Claude Haiku model to extract event information
3. Generates ICS files for each event
4. Adds events to a calendar

Please provide:
1. The complete project structure with all necessary files
2. package.json with all required dependencies (including @anthropic-ai/sdk, ical-generator, cheerio, date-fns-tz)
3. tsconfig.json optimized for Vercel serverless
4. vercel.json configuration
5. Environment variable setup (.env.example)

Include these environment variables:
- ANTHROPIC_API_KEY
- SOURCE_URL (the HTML page to scrape)
- CALENDAR_ENDPOINT (CalDAV or API endpoint)
- CALENDAR_AUTH (authentication details)

Follow Vercel's best practices for TypeScript serverless functions.
