Create a preprocessing module that:

1. Cleans HTML using Cheerio:
   - Removes scripts, styles, and comments
   - Extracts text content while preserving structure
   - Identifies potential event containers (div, article, section with event-related classes)

2. Implements heuristics to identify event data:
   - Date/time patterns (various formats)
   - Location patterns (addresses, venue names, "Online", "Virtual")
   - Title patterns (headings, emphasized text)

3. Chunks content intelligently for Claude API:
   - Respects token limits (use tiktoken for counting)
   - Maintains context boundaries (don't split events)
   - Prioritizes relevant sections

4. Provides fallback extraction without AI:
   - Regex patterns for common date formats
   - Structured data extraction (JSON-LD, microdata)

Export:
- preprocessHTML(html: string): ProcessedContent
- extractStructuredData(html: string): StructuredEvent[]

Theory: This reduces AI API costs by sending only relevant content.