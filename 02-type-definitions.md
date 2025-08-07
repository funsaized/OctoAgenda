Create comprehensive TypeScript interfaces and types for:

1. Event data structure with fields:
   - title: string
   - location: string (physical or virtual)
   - startTime: Date
   - endTime: Date
   - description: string
   - organizer?: { name: string; email?: string }
   - attendees?: Array<{ name: string; email: string }>
   - timezone: string (detected from source)
   - recurringRule?: string (for recurring events)

2. Configuration types for:
   - Source configuration (URL, selectors, patterns)
   - Calendar configuration (type, credentials, endpoint)
   - Processing options (batch size, retry logic)

3. API response types for Anthropic Claude

4. Error types for different failure scenarios

Include JSDoc comments explaining each field's purpose and constraints.
Reference: TypeScript Handbook on Advanced Types