/**
 * Timezone Intelligence Service
 * Handles timezone detection, conversion, and validation
 */

import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { isValid, isBefore, isAfter } from 'date-fns';

/**
 * City to timezone mapping
 */
const CITY_TIMEZONE_MAP: Record<string, string> = {
  // Major US cities
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  manhattan: 'America/New_York',
  brooklyn: 'America/New_York',
  queens: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  chicago: 'America/Chicago',
  boston: 'America/New_York',
  washington: 'America/New_York',
  dc: 'America/New_York',
  seattle: 'America/Los_Angeles',
  denver: 'America/Denver',
  phoenix: 'America/Phoenix',
  atlanta: 'America/New_York',
  miami: 'America/New_York',
  dallas: 'America/Chicago',
  houston: 'America/Chicago',
  philadelphia: 'America/New_York',
  detroit: 'America/Detroit',
  minneapolis: 'America/Chicago',
  portland: 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  orlando: 'America/New_York',
  austin: 'America/Chicago',

  // International cities
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  rome: 'Europe/Rome',
  madrid: 'Europe/Madrid',
  amsterdam: 'Europe/Amsterdam',
  zurich: 'Europe/Zurich',
  vienna: 'Europe/Vienna',
  tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  singapore: 'Asia/Singapore',
  mumbai: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',
  montreal: 'America/Montreal',
  'sao paulo': 'America/Sao_Paulo',
  'mexico city': 'America/Mexico_City',
  'buenos aires': 'America/Argentina/Buenos_Aires',
};

/**
 * US state to timezone mapping
 */
const STATE_TIMEZONE_MAP: Record<string, string> = {
  // Eastern Time
  ny: 'America/New_York',
  'new york': 'America/New_York',
  nj: 'America/New_York',
  'new jersey': 'America/New_York',
  pa: 'America/New_York',
  pennsylvania: 'America/New_York',
  ct: 'America/New_York',
  connecticut: 'America/New_York',
  ma: 'America/New_York',
  massachusetts: 'America/New_York',
  ri: 'America/New_York',
  'rhode island': 'America/New_York',
  vt: 'America/New_York',
  vermont: 'America/New_York',
  nh: 'America/New_York',
  'new hampshire': 'America/New_York',
  me: 'America/New_York',
  maine: 'America/New_York',
  de: 'America/New_York',
  delaware: 'America/New_York',
  md: 'America/New_York',
  maryland: 'America/New_York',
  va: 'America/New_York',
  virginia: 'America/New_York',
  wv: 'America/New_York',
  'west virginia': 'America/New_York',
  nc: 'America/New_York',
  'north carolina': 'America/New_York',
  sc: 'America/New_York',
  'south carolina': 'America/New_York',
  ga: 'America/New_York',
  georgia: 'America/New_York',
  fl: 'America/New_York',
  florida: 'America/New_York',
  oh: 'America/New_York',
  ohio: 'America/New_York',
  mi: 'America/Detroit',
  michigan: 'America/Detroit',

  // Central Time
  il: 'America/Chicago',
  illinois: 'America/Chicago',
  wi: 'America/Chicago',
  wisconsin: 'America/Chicago',
  mn: 'America/Chicago',
  minnesota: 'America/Chicago',
  ia: 'America/Chicago',
  iowa: 'America/Chicago',
  mo: 'America/Chicago',
  missouri: 'America/Chicago',
  ar: 'America/Chicago',
  arkansas: 'America/Chicago',
  la: 'America/Chicago',
  louisiana: 'America/Chicago',
  ms: 'America/Chicago',
  mississippi: 'America/Chicago',
  al: 'America/Chicago',
  alabama: 'America/Chicago',
  tn: 'America/Chicago',
  tennessee: 'America/Chicago',
  ky: 'America/New_York',
  kentucky: 'America/New_York',
  in: 'America/Indiana/Indianapolis',
  indiana: 'America/Indiana/Indianapolis',
  tx: 'America/Chicago',
  texas: 'America/Chicago',
  ok: 'America/Chicago',
  oklahoma: 'America/Chicago',
  ks: 'America/Chicago',
  kansas: 'America/Chicago',
  ne: 'America/Chicago',
  nebraska: 'America/Chicago',
  sd: 'America/Chicago',
  'south dakota': 'America/Chicago',
  nd: 'America/Chicago',
  'north dakota': 'America/Chicago',

  // Mountain Time
  co: 'America/Denver',
  colorado: 'America/Denver',
  wy: 'America/Denver',
  wyoming: 'America/Denver',
  mt: 'America/Denver',
  montana: 'America/Denver',
  ut: 'America/Denver',
  utah: 'America/Denver',
  nm: 'America/Denver',
  'new mexico': 'America/Denver',
  id: 'America/Boise',
  idaho: 'America/Boise',
  az: 'America/Phoenix',
  arizona: 'America/Phoenix',

  // Pacific Time
  ca: 'America/Los_Angeles',
  california: 'America/Los_Angeles',
  or: 'America/Los_Angeles',
  oregon: 'America/Los_Angeles',
  wa: 'America/Los_Angeles',
  washington: 'America/Los_Angeles',
  nv: 'America/Los_Angeles',
  nevada: 'America/Los_Angeles',

  // Alaska & Hawaii
  ak: 'America/Anchorage',
  alaska: 'America/Anchorage',
  hi: 'Pacific/Honolulu',
  hawaii: 'Pacific/Honolulu',
};

/**
 * Timezone abbreviation mapping
 */
const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  // US timezones
  est: 'America/New_York',
  edt: 'America/New_York',
  eastern: 'America/New_York',
  et: 'America/New_York',

  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  central: 'America/Chicago',
  ct: 'America/Chicago',

  mst: 'America/Denver',
  mdt: 'America/Denver',
  mountain: 'America/Denver',
  mt: 'America/Denver',

  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  pacific: 'America/Los_Angeles',
  pt: 'America/Los_Angeles',

  ast: 'America/Anchorage',
  adt: 'America/Anchorage',
  akst: 'America/Anchorage',
  akdt: 'America/Anchorage',

  hst: 'Pacific/Honolulu',
  hdt: 'Pacific/Honolulu',

  // International
  utc: 'UTC',
  gmt: 'UTC',
  bst: 'Europe/London',
  cet: 'Europe/Paris',
  cest: 'Europe/Paris',
  jst: 'Asia/Tokyo',
  kst: 'Asia/Seoul',
  ist: 'Asia/Kolkata',
  aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney',
};

/**
 * Detect timezone from text content
 */
export function detectTimezone(text: string, fallback: string = 'America/New_York'): string {
  const lowerText = text.toLowerCase();

  // 1. Look for explicit timezone mentions
  for (const [abbr, timezone] of Object.entries(TIMEZONE_ABBREVIATIONS)) {
    const pattern = new RegExp(`\\b${abbr}\\b`, 'i');
    if (pattern.test(text)) {
      return timezone;
    }
  }

  // 2. Look for city mentions
  for (const [city, timezone] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (lowerText.includes(city)) {
      return timezone;
    }
  }

  // 3. Look for state mentions
  for (const [state, timezone] of Object.entries(STATE_TIMEZONE_MAP)) {
    const pattern = new RegExp(`\\b${state}\\b`, 'i');
    if (pattern.test(lowerText)) {
      return timezone;
    }
  }

  // 4. Look for country patterns
  if (/\b(uk|united kingdom|britain)\b/i.test(lowerText)) {
    return 'Europe/London';
  }

  if (/\b(canada|canadian)\b/i.test(lowerText)) {
    return 'America/Toronto';
  }

  if (/\b(australia|australian)\b/i.test(lowerText)) {
    return 'Australia/Sydney';
  }

  // 5. Online/virtual event detection
  if (/\b(online|virtual|zoom|teams|webinar|livestream|remote)\b/i.test(lowerText)) {
    // For virtual events, keep the fallback timezone
    return fallback;
  }

  return fallback;
}

/**
 * Convert datetime between timezones
 */
export function convertToTimezone(date: Date, fromTz: string, toTz: string): Date {
  if (!isValid(date)) {
    throw new Error('Invalid date provided');
  }

  if (fromTz === toTz) {
    return date;
  }

  try {
    // Convert from source timezone to UTC, then to target timezone
    const utcDate = fromZonedTime(date, fromTz);
    return toZonedTime(utcDate, toTz);
  } catch (error) {
    console.error(`Timezone conversion failed: ${fromTz} -> ${toTz}`, error);
    return date;
  }
}

/**
 * Normalize date to Eastern Time
 */
export function normalizeToET(date: Date, sourceTz: string): Date {
  return convertToTimezone(date, sourceTz, 'America/New_York');
}

/**
 * Parse date string with timezone context
 */
export function parseDateWithTimezone(
  dateStr: string,
  timezoneContext: string,
  fallbackTimezone: string = 'America/New_York'
): Date {
  // First try parsing as-is
  let date = new Date(dateStr);

  if (!isValid(date)) {
    // Try common formats
    const formats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(\w{3})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        try {
          date = parseMatchedDate(match);
          break;
        } catch {
          continue;
        }
      }
    }
  }

  if (!isValid(date)) {
    throw new Error(`Unable to parse date: ${dateStr}`);
  }

  // Detect timezone from context
  const detectedTz = detectTimezone(timezoneContext, fallbackTimezone);

  // If date appears to be naive (no timezone), assume it's in the detected timezone
  if (
    !dateStr.includes('GMT') &&
    !dateStr.includes('UTC') &&
    !dateStr.includes('+') &&
    !dateStr.includes('Z')
  ) {
    // Convert from detected timezone to UTC
    date = fromZonedTime(date, detectedTz);
  }

  return date;
}

/**
 * Parse matched date components into Date object
 */
function parseMatchedDate(match: RegExpMatchArray): Date {
  // Implementation depends on the specific format matched
  // This is a simplified version
  const dateStr = match[0];
  return new Date(dateStr);
}

/**
 * Validate timezone string
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    const testDate = new Date();
    toZonedTime(testDate, timezone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get timezone offset in minutes
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    const utcDate = new Date(date.getTime());
    const zonedDate = toZonedTime(utcDate, timezone);
    return (utcDate.getTime() - zonedDate.getTime()) / (1000 * 60);
  } catch {
    return 0;
  }
}

/**
 * Check if timezone observes DST
 */
export function observesDST(timezone: string): boolean {
  const winter = new Date(2024, 0, 15); // January 15
  const summer = new Date(2024, 6, 15); // July 15

  const winterOffset = getTimezoneOffset(timezone, winter);
  const summerOffset = getTimezoneOffset(timezone, summer);

  return winterOffset !== summerOffset;
}

/**
 * Get DST transition dates for a year
 */
export function getDSTTransitions(
  timezone: string,
  year: number = new Date().getFullYear()
): {
  start?: Date;
  end?: Date;
} {
  if (!observesDST(timezone)) {
    return {};
  }

  // For US timezones, DST typically starts second Sunday in March
  // and ends first Sunday in November
  if (timezone.startsWith('America/')) {
    const marchStart = new Date(year, 2, 8); // March 8
    const marchSunday = getNextSunday(marchStart);
    const dstStart = new Date(marchSunday.getTime());
    dstStart.setHours(2, 0, 0, 0);

    const novemberStart = new Date(year, 10, 1); // November 1
    const novemberSunday = getNextSunday(novemberStart);
    const dstEnd = new Date(novemberSunday.getTime());
    dstEnd.setHours(2, 0, 0, 0);

    return { start: dstStart, end: dstEnd };
  }

  return {};
}

/**
 * Get next Sunday from a given date
 */
function getNextSunday(date: Date): Date {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + (7 - date.getDay()));
  return sunday;
}

/**
 * Validate that event times are reasonable
 */
export function validateEventTimes(
  startTime: Date,
  endTime: Date,
  timezone: string
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check if dates are valid
  if (!isValid(startTime)) {
    return { valid: false, warnings: ['Invalid start time'] };
  }

  if (!isValid(endTime)) {
    return { valid: false, warnings: ['Invalid end time'] };
  }

  // Check if end time is after start time
  if (!isAfter(endTime, startTime)) {
    return { valid: false, warnings: ['End time must be after start time'] };
  }

  // Check if event is too long (more than 24 hours)
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  if (durationHours > 24) {
    warnings.push('Event duration exceeds 24 hours');
  }

  // Check if event is in the past (more than 24 hours ago)
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  if (isBefore(startTime, oneDayAgo)) {
    warnings.push('Event appears to be in the past');
  }

  // Check if event is too far in the future (more than 2 years)
  const twoYearsFromNow = new Date();
  twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);

  if (isAfter(startTime, twoYearsFromNow)) {
    warnings.push('Event is more than 2 years in the future');
  }

  // Validate timezone
  if (!isValidTimezone(timezone)) {
    warnings.push(`Invalid timezone: ${timezone}`);
  }

  return { valid: true, warnings };
}

/**
 * Smart timezone detection with confidence scoring
 */
export function detectTimezoneWithConfidence(
  text: string,
  fallback: string = 'America/New_York'
): { timezone: string; confidence: number } {
  const lowerText = text.toLowerCase();
  let bestMatch = { timezone: fallback, confidence: 0 };

  // Check timezone abbreviations (high confidence)
  for (const [abbr, timezone] of Object.entries(TIMEZONE_ABBREVIATIONS)) {
    const pattern = new RegExp(`\\b${abbr}\\b`, 'i');
    if (pattern.test(text)) {
      const confidence = abbr.length > 2 ? 0.9 : 0.7; // Longer abbreviations more confident
      if (confidence > bestMatch.confidence) {
        bestMatch = { timezone, confidence };
      }
    }
  }

  // Check city mentions (medium-high confidence)
  for (const [city, timezone] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (lowerText.includes(city)) {
      const confidence = city.length > 4 ? 0.8 : 0.6; // Longer city names more confident
      if (confidence > bestMatch.confidence) {
        bestMatch = { timezone, confidence };
      }
    }
  }

  // Check state mentions (medium confidence)
  for (const [state, timezone] of Object.entries(STATE_TIMEZONE_MAP)) {
    const pattern = new RegExp(`\\b${state}\\b`, 'i');
    if (pattern.test(lowerText)) {
      const confidence = state.length > 2 ? 0.5 : 0.3;
      if (confidence > bestMatch.confidence) {
        bestMatch = { timezone, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Handle all-day events
 */
export function createAllDayEvent(date: Date, timezone: string): { start: Date; end: Date } {
  // All-day events start at midnight and end at 11:59 PM in the target timezone
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return {
    start: fromZonedTime(startOfDay, timezone),
    end: fromZonedTime(endOfDay, timezone),
  };
}

/**
 * Format date for display in a specific timezone
 */
export function formatDateInTimezone(
  date: Date,
  timezone: string,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss zzz'
): string {
  try {
    return format(toZonedTime(date, timezone), formatStr, { timeZone: timezone });
  } catch (error) {
    console.error(`Failed to format date in timezone ${timezone}:`, error);
    return date.toISOString();
  }
}

/**
 * Get current time in a specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Resolve ambiguous timezone abbreviations
 */
export function resolveAmbiguousTimezone(
  abbreviation: string,
  context: string,
  fallback: string = 'America/New_York'
): string {
  const lowerAbbr = abbreviation.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Handle CST ambiguity (Central Standard Time vs China Standard Time)
  if (lowerAbbr === 'cst') {
    if (
      lowerContext.includes('china') ||
      lowerContext.includes('beijing') ||
      lowerContext.includes('shanghai')
    ) {
      return 'Asia/Shanghai';
    }
    return 'America/Chicago';
  }

  // Handle IST ambiguity (India Standard Time vs Israel Standard Time)
  if (lowerAbbr === 'ist') {
    if (
      lowerContext.includes('israel') ||
      lowerContext.includes('jerusalem') ||
      lowerContext.includes('tel aviv')
    ) {
      return 'Asia/Jerusalem';
    }
    return 'Asia/Kolkata';
  }

  // Default lookup
  return TIMEZONE_ABBREVIATIONS[lowerAbbr] || fallback;
}

/**
 * Batch timezone detection for multiple events
 */
export function batchDetectTimezones(
  texts: string[],
  fallback: string = 'America/New_York'
): string[] {
  const detectedTimezones: string[] = [];
  const contextualInfo = texts.join(' '); // Combine all texts for better context

  for (const text of texts) {
    const detection = detectTimezoneWithConfidence(text + ' ' + contextualInfo, fallback);
    detectedTimezones.push(detection.timezone);
  }

  return detectedTimezones;
}

/**
 * Check if date falls within DST period
 */
export function isDSTActive(date: Date, timezone: string): boolean {
  const transitions = getDSTTransitions(timezone, date.getFullYear());

  if (!transitions.start || !transitions.end) {
    return false;
  }

  return isAfter(date, transitions.start) && isBefore(date, transitions.end);
}

/**
 * Convert timezone abbreviation to IANA timezone
 */
export function abbreviationToIANA(abbreviation: string, context?: string): string | null {
  const resolved = context
    ? resolveAmbiguousTimezone(abbreviation, context)
    : TIMEZONE_ABBREVIATIONS[abbreviation.toLowerCase()];

  return resolved || null;
}
