Create an ICS generator module using ical-generator that:

1. Generates valid ICS files with:
   - Proper VTIMEZONE components
   - UUID-based UIDs for uniqueness
   - DTSTAMP for creation time
   - Support for recurring events (RRULE)
   - Proper line folding (75 chars)
   - HTML and plain text descriptions

2. Implements event deduplication:
   - Hash-based duplicate detection
   - Fuzzy matching for similar events
   - Update vs. create logic

3. Handles special cases:
   - All-day events
   - Multi-day events
   - Virtual events with meeting links
   - Cancelled or rescheduled events

4. Provides multiple output formats:
   - Individual ICS files per event
   - Combined calendar file
   - JSON representation for APIs

5. Exports:
   - generateICS(event: Event): string
   - generateBulkICS(events: Event[]): string
   - validateICS(icsContent: string): boolean

Best Practice: Always validate against RFC 5545 (iCalendar specification)
Include X-properties for custom metadata