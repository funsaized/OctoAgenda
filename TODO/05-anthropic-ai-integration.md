Create an Anthropic API integration module that:

1. Uses Claude 3 Haiku (claude-3-haiku-20240307) for cost efficiency
2. Implements structured extraction with this prompt template:

"""
Extract all events from this HTML content. Return JSON array with:
- title: event name
- startDateTime: ISO 8601 format with timezone
- endDateTime: ISO 8601 format or duration
- location: venue/address or "Online"/"Virtual"
- description: brief summary
- organizer: name and contact if available

HTML Content:
[CONTENT]

Important:
- Detect timezone from context (city names, timezone abbreviations)
- If no timezone found, note as "UNKNOWN"
- Handle relative dates (e.g., "tomorrow", "next Friday")
- Extract recurring patterns if mentioned
"""

3. Implements:
   - Retry logic for API failures
   - Response validation and sanitization
   - Fallback to regex extraction if AI fails
   - Token usage tracking and cost estimation
   - Batch processing for multiple HTML chunks

4. Exports:
   - extractEvents(content: string, context?: ExtractionContext): Promise<Event[]>
   - estimateCost(content: string): number
   - validateExtraction(events: Event[]): ValidationResult

Reference: Anthropic API Documentation for Claude 3 models
Best Practice: Always validate AI outputs before using them