/**
 * ICS File Generation Service
 * Generates iCalendar files from event data
 */
import { CalendarEvent, ICSOptions } from '@/lib/api/types/index';
import { type Logger } from '@/lib/api/utils/logger';
import ical, {
  ICalAlarmType,
  ICalCalendar,
  ICalCalendarMethod,
  ICalEvent,
  ICalEventData,
  ICalEventRepeatingFreq,
  ICalEventStatus,
  ICalRepeatingOptions,
  ICalWeekday,
} from 'ical-generator';

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
  scale: 'GREGORIAN',
};

/**
 * Generate ICS file from events
 */
export function generateICS(
  events: CalendarEvent[],
  options: Partial<ICSOptions> | undefined,
  log: Logger
): string {
  const config: ICSOptions = { ...DEFAULT_ICS_OPTIONS, ...options };

  log.info(
    { eventCount: events.length, calendarName: config.calendarName, timezone: config.timezone },
    'Starting ICS generation'
  );

  const calendar = createCalendar(config);
  let successCount = 0;
  let failedCount = 0;

  for (const event of events) {
    try {
      addEventToCalendar(calendar, event, config);
      successCount++;
      log.debug({ title: event.title, startTime: event.startTime }, 'Event added to calendar');
    } catch (err) {
      failedCount++;
      log.warn({ err, title: event.title }, 'Failed to add event to calendar');
    }
  }

  const icsContent = calendar.toString();

  log.info(
    { successCount, failedCount, icsLength: icsContent.length },
    'ICS generation complete'
  );

  return icsContent;
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
    scale: options.scale,
  });

  if (options.method) {
    const methodMap: Record<string, ICalCalendarMethod> = {
      PUBLISH: ICalCalendarMethod.PUBLISH,
      REQUEST: ICalCalendarMethod.REQUEST,
      REPLY: ICalCalendarMethod.REPLY,
      CANCEL: ICalCalendarMethod.CANCEL,
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
  const eventData: ICalEventData = {
    start: event.startTime,
    end: event.endTime,
    summary: event.title,
    description: event.description,
    location: event.location,
    timezone: event.timezone || options.timezone,
    categories: event.categories?.map((cat) => ({ name: cat })),
  };

  if (event.url) {
    eventData.url = event.url;
  }

  if (event.organizer) {
    eventData.organizer = {
      name: event.organizer.name || 'system',
      email: event.organizer.email || 'noreply@example.com',
    };
  }

  if (event.status) {
    const statusMap: Record<string, ICalEventStatus> = {
      CONFIRMED: ICalEventStatus.CONFIRMED,
      TENTATIVE: ICalEventStatus.TENTATIVE,
      CANCELLED: ICalEventStatus.CANCELLED,
    };

    const status = statusMap[event.status];
    if (status) {
      eventData.status = status;
    }
  }

  const calEvent = calendar.createEvent(eventData);

  calEvent.uid(event.uid || generateUID(event));

  if (event.attendees && event.attendees.length > 0) {
    for (const attendee of event.attendees) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attendeeData: any = {
        email: attendee.email,
        name: attendee.name,
        rsvp: attendee.rsvp,
      };
      if (attendee.status) attendeeData.status = attendee.status;
      if (attendee.role) attendeeData.role = attendee.role;
      calEvent.createAttendee(attendeeData);
    }
  }

  if (event.recurringRule) {
    try {
      applyRecurringRule(calEvent, event.recurringRule);
    } catch {
      // Ignore invalid recurring rules
    }
  }

  if (options.includeAlarms) {
    const alarmMinutes = options.defaultAlarmMinutes || 30;

    calEvent.createAlarm({
      type: ICalAlarmType.display,
      trigger: -alarmMinutes * 60,
      description: `Reminder: ${event.title}`,
    });

    if (event.organizer?.email) {
      const emailAlarm = calEvent.createAlarm({
        type: ICalAlarmType.email,
        trigger: -alarmMinutes * 60,
        description: `Reminder: ${event.title}`,
        summary: `Event Reminder: ${event.title}`,
      });

      emailAlarm.createAttendee({
        email: event.organizer.email,
        name: event.organizer.name,
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
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

interface RecurringRules {
  freq?: ICalEventRepeatingFreq;
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: ICalWeekday[];
  byMonth?: number[];
  byMonthDay?: number[];
}

/**
 * Apply recurring rule to event
 */
function applyRecurringRule(event: ICalEvent, rrule: string): void {
  const rules = parseRRule(rrule);

  if (rules.freq) {
    const repeating: ICalRepeatingOptions = {
      freq: rules.freq,
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
function parseRRule(rrule: string): RecurringRules {
  const rules: RecurringRules = {};

  const ruleStr = rrule.replace(/^RRULE:/i, '');
  const pairs = ruleStr.split(';');

  const validFreqs: ICalEventRepeatingFreq[] = [
    ICalEventRepeatingFreq.SECONDLY,
    ICalEventRepeatingFreq.MINUTELY,
    ICalEventRepeatingFreq.HOURLY,
    ICalEventRepeatingFreq.DAILY,
    ICalEventRepeatingFreq.WEEKLY,
    ICalEventRepeatingFreq.MONTHLY,
    ICalEventRepeatingFreq.YEARLY,
  ];

  const weekdayMap: Record<string, ICalWeekday> = {
    SU: ICalWeekday.SU,
    MO: ICalWeekday.MO,
    TU: ICalWeekday.TU,
    WE: ICalWeekday.WE,
    TH: ICalWeekday.TH,
    FR: ICalWeekday.FR,
    SA: ICalWeekday.SA,
  };

  for (const pair of pairs) {
    const [key, value] = pair.split('=');

    if (!key || !value) continue;

    switch (key.toUpperCase()) {
      case 'FREQ': {
        const freq = validFreqs.find((f) => f === value.toUpperCase());
        if (freq) rules.freq = freq;
        break;
      }

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
        rules.byDay = value
          .split(',')
          .map((d) => weekdayMap[d.toUpperCase()])
          .filter((d): d is ICalWeekday => d !== undefined);
        break;

      case 'BYMONTH':
        rules.byMonth = value.split(',').map((m) => parseInt(m, 10));
        break;

      case 'BYMONTHDAY':
        rules.byMonthDay = value.split(',').map((d) => parseInt(d, 10));
        break;
    }
  }

  return rules;
}
