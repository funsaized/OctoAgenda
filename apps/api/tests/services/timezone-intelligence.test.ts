/**
 * Tests for timezone intelligence service
 */

import {
  detectTimezone,
  detectTimezoneWithConfidence,
  convertToTimezone,
  isValidTimezone,
  validateEventTimes,
  resolveAmbiguousTimezone,
  parseDateWithTimezone,
  observesDST
} from '../../src/services/timezone-intelligence.js';
import { isValid } from 'date-fns';

describe('Timezone Intelligence', () => {
  describe('detectTimezone', () => {
    it('should detect timezone from city names', () => {
      expect(detectTimezone('Event in New York')).toBe('America/New_York');
      expect(detectTimezone('Conference in San Francisco')).toBe('America/Los_Angeles');
      expect(detectTimezone('Meeting in London')).toBe('Europe/London');
      expect(detectTimezone('Workshop in Tokyo')).toBe('Asia/Tokyo');
    });

    it('should detect timezone from abbreviations', () => {
      expect(detectTimezone('Meeting at 2 PM EST')).toBe('America/New_York');
      expect(detectTimezone('Call at 10 AM PST')).toBe('America/Los_Angeles');
      expect(detectTimezone('Event at 3 PM GMT')).toBe('UTC');
      expect(detectTimezone('Conference at 9 AM JST')).toBe('Asia/Tokyo');
    });

    it('should detect timezone from state abbreviations', () => {
      expect(detectTimezone('Event in CA')).toBe('America/Los_Angeles');
      expect(detectTimezone('Meeting in TX')).toBe('America/Chicago');
      expect(detectTimezone('Conference in FL')).toBe('America/New_York');
    });

    it('should handle virtual events', () => {
      expect(detectTimezone('Online webinar', 'America/Chicago')).toBe('America/Chicago');
      expect(detectTimezone('Virtual meeting on Zoom')).toBe('America/New_York');
    });

    it('should return fallback for unrecognized locations', () => {
      expect(detectTimezone('Event in Unknown City')).toBe('America/New_York');
      expect(detectTimezone('Random text', 'Europe/Paris')).toBe('Europe/Paris');
    });
  });

  describe('detectTimezoneWithConfidence', () => {
    it('should return high confidence for explicit abbreviations', () => {
      const result = detectTimezoneWithConfidence('Meeting at 3 PM Eastern');
      expect(result.timezone).toBe('America/New_York');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should return medium confidence for city names', () => {
      const result = detectTimezoneWithConfidence('Conference in Chicago');
      expect(result.timezone).toBe('America/Chicago');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return low confidence for state abbreviations', () => {
      const result = detectTimezoneWithConfidence('Event in CA');
      expect(result.timezone).toBe('America/Los_Angeles');
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('convertToTimezone', () => {
    it('should convert between timezones correctly', () => {
      const date = new Date('2024-03-15T15:00:00Z'); // 3 PM UTC
      const etTime = convertToTimezone(date, 'UTC', 'America/New_York');
      const ptTime = convertToTimezone(date, 'UTC', 'America/Los_Angeles');

      // Should be different hours due to timezone offset
      expect(etTime.getHours()).not.toBe(ptTime.getHours());
    });

    it('should handle same timezone conversion', () => {
      const date = new Date('2024-03-15T15:00:00Z');
      const result = convertToTimezone(date, 'UTC', 'UTC');
      expect(result).toEqual(date);
    });

    it('should handle invalid dates gracefully', () => {
      const invalidDate = new Date('invalid');
      expect(() => convertToTimezone(invalidDate, 'UTC', 'America/New_York'))
        .toThrow('Invalid date provided');
    });
  });

  describe('resolveAmbiguousTimezone', () => {
    it('should resolve CST ambiguity based on context', () => {
      expect(resolveAmbiguousTimezone('CST', 'Event in Chicago')).toBe('America/Chicago');
      expect(resolveAmbiguousTimezone('CST', 'Conference in Beijing')).toBe('Asia/Shanghai');
      expect(resolveAmbiguousTimezone('CST', 'Meeting in Shanghai')).toBe('Asia/Shanghai');
    });

    it('should resolve IST ambiguity based on context', () => {
      expect(resolveAmbiguousTimezone('IST', 'Event in Mumbai')).toBe('Asia/Kolkata');
      expect(resolveAmbiguousTimezone('IST', 'Conference in Jerusalem')).toBe('Asia/Jerusalem');
      expect(resolveAmbiguousTimezone('IST', 'Meeting in Tel Aviv')).toBe('Asia/Jerusalem');
    });
  });

  describe('validateEventTimes', () => {
    it('should validate correct event times', () => {
      const start = new Date('2024-06-15T10:00:00Z');
      const end = new Date('2024-06-15T12:00:00Z');

      const result = validateEventTimes(start, end, 'America/New_York');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject events with end before start', () => {
      const start = new Date('2024-06-15T12:00:00Z');
      const end = new Date('2024-06-15T10:00:00Z');

      const result = validateEventTimes(start, end, 'America/New_York');
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('End time must be after start time');
    });

    it('should warn about very long events', () => {
      const start = new Date('2024-06-15T10:00:00Z');
      const end = new Date('2024-06-16T12:00:00Z'); // 26 hours

      const result = validateEventTimes(start, end, 'America/New_York');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Event duration exceeds 24 hours');
    });

    it('should warn about past events', () => {
      const start = new Date('2020-01-01T10:00:00Z');
      const end = new Date('2020-01-01T12:00:00Z');

      const result = validateEventTimes(start, end, 'America/New_York');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Event appears to be in the past');
    });

    it('should validate invalid timezones', () => {
      const start = new Date('2024-06-15T10:00:00Z');
      const end = new Date('2024-06-15T12:00:00Z');

      const result = validateEventTimes(start, end, 'Invalid/Timezone');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Invalid timezone: Invalid/Timezone');
    });
  });

  describe('isValidTimezone', () => {
    it('should validate correct timezone strings', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('should reject invalid timezone strings', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('EST')).toBe(false); // Abbreviations aren't IANA timezones
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('observesDST', () => {
    it('should detect DST for US timezones', () => {
      expect(observesDST('America/New_York')).toBe(true);
      expect(observesDST('America/Los_Angeles')).toBe(true);
      expect(observesDST('America/Chicago')).toBe(true);
    });

    it('should detect no DST for Arizona', () => {
      expect(observesDST('America/Phoenix')).toBe(false);
    });

    it('should detect no DST for UTC', () => {
      expect(observesDST('UTC')).toBe(false);
    });
  });

  describe('parseDateWithTimezone', () => {
    const mockCurrentDate = new Date('2024-03-01T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(mockCurrentDate);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should parse date with timezone context', () => {
      const result = parseDateWithTimezone(
        'March 15, 2024 at 2:00 PM',
        'Event in New York',
        'America/New_York'
      );

      expect(result).toBeInstanceOf(Date);
      expect(isValid(result)).toBe(true);
    });

    it('should handle ISO dates', () => {
      const isoDate = '2024-03-15T14:00:00-05:00';
      const result = parseDateWithTimezone(isoDate, '', 'America/New_York');

      expect(result).toBeInstanceOf(Date);
      expect(isValid(result)).toBe(true);
    });

    it('should throw for unparseable dates', () => {
      expect(() => parseDateWithTimezone('invalid date', '', 'America/New_York'))
        .toThrow('Unable to parse date');
    });
  });

  describe('Edge Cases', () => {
    it('should handle DST transitions', () => {
      // Spring forward: 2 AM becomes 3 AM
      const springForward = new Date('2024-03-10T02:30:00');
      expect(() => convertToTimezone(springForward, 'America/New_York', 'UTC'))
        .not.toThrow();

      // Fall back: 2 AM occurs twice
      const fallBack = new Date('2024-11-03T01:30:00');
      expect(() => convertToTimezone(fallBack, 'America/New_York', 'UTC'))
        .not.toThrow();
    });

    it('should handle international date line crossing', () => {
      const date = new Date('2024-03-15T23:00:00Z');
      const tokyoTime = convertToTimezone(date, 'UTC', 'Asia/Tokyo');
      const laTime = convertToTimezone(date, 'UTC', 'America/Los_Angeles');

      // Tokyo should be next day, LA should be same day
      expect(tokyoTime.getUTCDate()).toBeGreaterThan(laTime.getUTCDate());
    });

    it('should handle leap year dates', () => {
      const leapDay = new Date('2024-02-29T12:00:00Z');
      expect(() => convertToTimezone(leapDay, 'UTC', 'America/New_York'))
        .not.toThrow();
    });
  });
});

/**
 * Mock data for testing
 */
export const mockEventTexts = [
  'Conference in New York on March 15, 2024 at 2 PM EST',
  'Virtual meeting tomorrow at 10 AM Pacific',
  'Workshop in London next Friday at 3 PM GMT',
  'Seminar in Tokyo on 2024-03-20T14:00:00+09:00',
  'All-day event in Chicago on March 25, 2024'
];

export const mockHTMLContent = `
<div class="events">
  <div class="event">
    <h3>Sample Event</h3>
    <div class="date">March 15, 2024 at 2:00 PM EST</div>
    <div class="location">New York, NY</div>
  </div>
</div>
`;

export const mockAIResponse = {
  events: [
    {
      title: 'Sample Event',
      startDateTime: '2024-03-15T14:00:00-05:00',
      endDateTime: '2024-03-15T16:00:00-05:00',
      location: 'New York, NY',
      description: 'Sample event description',
      timezone: 'America/New_York'
    }
  ],
  detectedTimezone: 'America/New_York'
};
