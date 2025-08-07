/**
 * ICS File Generation Service
 * Generates iCalendar files from event data
 */

import ical, { 
  ICalCalendar, 
  ICalCalendarMethod,
  ICalEvent,
  ICalEventData,
  ICalEventStatus,
  ICalAlarmType
} from 'ical-generator';
import { 
  CalendarEvent, 
  ICSOptions,
 
} from '../types/index.js';

/**
 * Default ICS generation options
 */
const DEFAULT_ICS_OPTIONS: ICSOptions = {
  prodId: '//ICS-Scraper//Event Calendar//EN',
  calendarName: 'Scraped Events',
  description: 'Events automatically extracted from web pages',
  timezone: 'America/New_York',
  includeAlarms: true,
  defaultAlarmMinutes: 30,
  method: 'PUBLISH',
  scale: 'GREGORIAN'
};

/**
 * Generate ICS file from events
 */
export function generateICS(
  events: CalendarEvent[],
  options?: Partial<ICSOptions>
): string {
  const config: ICSOptions = { ...DEFAULT_ICS_OPTIONS, ...options };
  
  // Create calendar
  const calendar = createCalendar(config);
  
  // Add events to calendar
  for (const event of events) {
    try {
      addEventToCalendar(calendar, event, config);
    } catch (error) {
      console.error(`Failed to add event "${event.title}" to calendar:`, error);
      // Continue with other events
    }
  }
  
  // Generate ICS string
  return calendar.toString();
}

/**
 * Generate individual ICS file for a single event
 */
export function generateSingleEventICS(
  event: CalendarEvent,
  options?: Partial<ICSOptions>
): string {
  const config: ICSOptions = { ...DEFAULT_ICS_OPTIONS, ...options, method: 'REQUEST' };
  
  // Create calendar with single event
  const calendar = createCalendar(config);
  addEventToCalendar(calendar, event, config);
  
  return calendar.toString();
}

/**
 * Create calendar instance with configuration
 */
function createCalendar(options: ICSOptions): ICalCalendar {
  const calendar = ical({
    name: options.calendarName,
    description: options.description,
    prodId: options.prodId,
    timezone: options.timezone,
    scale: options.scale
  });
  
  // Set calendar method
  if (options.method) {
    const methodMap: Record<string, ICalCalendarMethod> = {
      'PUBLISH': ICalCalendarMethod.PUBLISH,
      'REQUEST': ICalCalendarMethod.REQUEST,
      'REPLY': ICalCalendarMethod.REPLY,
      'CANCEL': ICalCalendarMethod.CANCEL
    };
    
    const method = methodMap[options.method];
    if (method) {
      calendar.method(method);
    }
  }
  
  return calendar;
}

/**
 * Add event to calendar
 */
function addEventToCalendar(
  calendar: ICalCalendar,
  event: CalendarEvent,
  options: ICSOptions
): ICalEvent {
  // Prepare event data
  const eventData: ICalEventData = {
    start: event.startTime,
    end: event.endTime,
    summary: event.title,
    description: event.description,
    location: event.location,
    timezone: event.timezone || options.timezone,
    categories: event.categories?.map(cat => ({ name: cat }))
  };
  
  // Add URL if available
  if (event.url) {
    eventData.url = event.url;
  }
  
  // Add organizer if available
  if (event.organizer) {
    eventData.organizer = {
      name: event.organizer.name,
      email: event.organizer.email || 'noreply@example.com'
    };
  }
  
  // Set status
  if (event.status) {
    const statusMap: Record<string, ICalEventStatus> = {
      'CONFIRMED': ICalEventStatus.CONFIRMED,
      'TENTATIVE': ICalEventStatus.TENTATIVE,
      'CANCELLED': ICalEventStatus.CANCELLED
    };
    
    const status = statusMap[event.status];
    if (status) {
      eventData.status = status;
    }
  }
  
  // Create event
  const calEvent = calendar.createEvent(eventData);
  
  // Set UID separately
  calEvent.uid(event.uid || generateUID(event));
  
  // Add attendees
  if (event.attendees && event.attendees.length > 0) {
    for (const attendee of event.attendees) {
      calEvent.createAttendee({
        email: attendee.email,
        name: attendee.name,
        rsvp: attendee.rsvp,
        status: attendee.status as any,
        role: attendee.role as any
      });
    }
  }
  
  // Add recurring rule if present
  if (event.recurringRule) {
    try {
      // Parse RRULE and apply to event
      applyRecurringRule(calEvent, event.recurringRule);
    } catch (error) {
      console.warn(`Failed to apply recurring rule: ${error}`);
    }
  }
  
  // Add alarm if configured
  if (options.includeAlarms) {
    const alarmMinutes = options.defaultAlarmMinutes || 30;
    
    calEvent.createAlarm({
      type: ICalAlarmType.display,
      trigger: -alarmMinutes * 60, // Negative seconds before event
      description: `Reminder: ${event.title}`
    });
    
    // Add email alarm if organizer email is available
    if (event.organizer?.email) {
      const emailAlarm = calEvent.createAlarm({
        type: ICalAlarmType.email,
        trigger: -alarmMinutes * 60,
        description: `Reminder: ${event.title}`,
        summary: `Event Reminder: ${event.title}`
      });
      
      emailAlarm.createAttendee({
        email: event.organizer.email,
        name: event.organizer.name
      });
    }
  }
  
  return calEvent;
}

/**
 * Generate unique identifier for event
 */
function generateUID(event: CalendarEvent): string {
  const timestamp = event.startTime.getTime();
  const titleHash = simpleHash(event.title);
  const random = Math.random().toString(36).substring(2, 9);
  
  return `${timestamp}-${titleHash}-${random}@ics-scraper`;
}

/**
 * Simple hash function for generating UIDs
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Apply recurring rule to event
 */
function applyRecurringRule(event: ICalEvent, rrule: string): void {
  // Parse RRULE string
  const rules = parseRRule(rrule);
  
  if (rules.freq) {
    const repeating: any = {
      freq: rules.freq
    };
    
    if (rules.interval) {
      repeating.interval = rules.interval;
    }
    
    if (rules.count) {
      repeating.count = rules.count;
    }
    
    if (rules.until) {
      repeating.until = rules.until;
    }
    
    if (rules.byDay) {
      repeating.byDay = rules.byDay;
    }
    
    if (rules.byMonth) {
      repeating.byMonth = rules.byMonth;
    }
    
    if (rules.byMonthDay) {
      repeating.byMonthDay = rules.byMonthDay;
    }
    
    event.repeating(repeating);
  }
}

/**
 * Parse RRULE string into components
 */
function parseRRule(rrule: string): Record<string, any> {
  const rules: Record<string, any> = {};
  
  // Remove RRULE: prefix if present
  const ruleStr = rrule.replace(/^RRULE:/i, '');
  
  // Split into key-value pairs
  const pairs = ruleStr.split(';');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    
    if (!key || !value) continue;
    
    switch (key.toUpperCase()) {
      case 'FREQ':
        rules.freq = value.toUpperCase();
        break;
      
      case 'INTERVAL':
        rules.interval = parseInt(value, 10);
        break;
      
      case 'COUNT':
        rules.count = parseInt(value, 10);
        break;
      
      case 'UNTIL':
        rules.until = new Date(value);
        break;
      
      case 'BYDAY':
        rules.byDay = value.split(',');
        break;
      
      case 'BYMONTH':
        rules.byMonth = value.split(',').map(m => parseInt(m, 10));
        break;
      
      case 'BYMONTHDAY':
        rules.byMonthDay = value.split(',').map(d => parseInt(d, 10));
        break;
    }
  }
  
  return rules;
}

/**
 * Validate ICS content
 */
export function validateICS(icsContent: string): boolean {
  try {
    // Check for required ICS headers
    if (!icsContent.includes('BEGIN:VCALENDAR')) {
      return false;
    }
    
    if (!icsContent.includes('END:VCALENDAR')) {
      return false;
    }
    
    if (!icsContent.includes('VERSION:2.0')) {
      return false;
    }
    
    // Check for at least one event
    if (!icsContent.includes('BEGIN:VEVENT')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Create ICS download response headers
 */
export function getICSHeaders(filename: string = 'events.ics'): Record<string, string> {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

/**
 * Generate ICS blob for browser download
 */
export function generateICSBlob(icsContent: string): Blob {
  return new Blob([icsContent], { type: 'text/calendar' });
}

/**
 * Generate ICS download URL
 */
export function generateICSDownloadURL(icsContent: string): string {
  const blob = generateICSBlob(icsContent);
  return URL.createObjectURL(blob);
}

/**
 * Batch generate ICS files for multiple event sets
 */
export function batchGenerateICS(
  eventSets: CalendarEvent[][],
  options?: Partial<ICSOptions>
): string[] {
  return eventSets.map(events => generateICS(events, options));
}

/**
 * Merge multiple ICS strings into one
 */
export function mergeICSFiles(icsFiles: string[], options?: Partial<ICSOptions>): string {
  const config: ICSOptions = { ...DEFAULT_ICS_OPTIONS, ...options };
  const calendar = createCalendar(config);
  
  // Extract events from each ICS file and add to merged calendar
  for (const icsContent of icsFiles) {
    try {
      const events = parseICSEvents(icsContent);
      for (const event of events) {
        addEventToCalendar(calendar, event, config);
      }
    } catch (error) {
      console.error('Failed to merge ICS file:', error);
    }
  }
  
  return calendar.toString();
}

/**
 * Parse events from ICS content (simplified)
 */
function parseICSEvents(icsContent: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  // This is a simplified parser - in production, use a proper ICS parser library
  const eventMatches = icsContent.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g);
  
  if (eventMatches) {
    for (const eventStr of eventMatches) {
      const event = parseICSEvent(eventStr);
      if (event) {
        events.push(event);
      }
    }
  }
  
  return events;
}

/**
 * Parse single ICS event (simplified)
 */
function parseICSEvent(eventStr: string): CalendarEvent | null {
  try {
    const getField = (field: string): string | undefined => {
      const match = eventStr.match(new RegExp(`${field}:(.*)`, 'i'));
      return match && match[1] ? match[1].trim() : undefined;
    };
    
    const summary = getField('SUMMARY');
    const dtstart = getField('DTSTART');
    const dtend = getField('DTEND');
    const location = getField('LOCATION');
    const description = getField('DESCRIPTION');
    
    if (!summary || !dtstart) {
      return null;
    }
    
    return {
      title: summary,
      startTime: parseICSDate(dtstart),
      endTime: dtend ? parseICSDate(dtend) : addDefaultDuration(parseICSDate(dtstart)),
      location: location || 'TBD',
      description: description || '',
      timezone: 'UTC'
    };
  } catch {
    return null;
  }
}

/**
 * Parse ICS date format
 */
function parseICSDate(dateStr: string): Date {
  // Handle basic YYYYMMDDTHHMMSS format
  if (dateStr.length === 15 || dateStr.length === 16) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hour = parseInt(dateStr.substring(9, 11), 10);
    const minute = parseInt(dateStr.substring(11, 13), 10);
    const second = parseInt(dateStr.substring(13, 15), 10);
    
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  
  return new Date(dateStr);
}

/**
 * Add default duration to date
 */
function addDefaultDuration(date: Date): Date {
  const endDate = new Date(date);
  endDate.setHours(endDate.getHours() + 2);
  return endDate;
}