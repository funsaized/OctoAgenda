Create a timezone handling module using date-fns-tz that:

1. Implements timezone detection from text:
   - City/state to timezone mapping
   - Timezone abbreviation handling (EST, PST, etc.)
   - DST awareness
   - Geographic inference from venue addresses

2. Provides conversion utilities:
   - convertToTimezone(date: Date, fromTz: string, toTz: string): Date
   - detectTimezone(text: string, fallback?: string): string
   - normalizeToET(date: Date, sourceTz: string): Date

3. Handles edge cases:
   - Ambiguous abbreviations (CST = Central or China?)
   - DST transitions
   - Events spanning timezone changes
   - All-day events vs. timed events

4. Implements validation:
   - Ensures times are in the future
   - Validates timezone strings
   - Checks for impossible dates

Include comprehensive tests for common scenarios.

Theory: Timezone bugs are a leading cause of calendar sync issues.
Reference: IANA Time Zone Database