export type EventType =
  | "holiday"
  | "no-school"
  | "early-dismissal"
  | "break"
  | "first-day"
  | "last-day"
  | "school";

interface BaseEvent {
  title: string;
  type: EventType;
  allDay: boolean;
  description?: string;
}

export interface SingleDayEvent extends BaseEvent {
  date: string; // YYYY-MM-DD
}

export interface MultiDayEvent extends BaseEvent {
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive)
}

export type SchoolEvent = SingleDayEvent | MultiDayEvent;

export function isSingleDay(event: SchoolEvent): event is SingleDayEvent {
  return "date" in event;
}

export function isMultiDay(event: SchoolEvent): event is MultiDayEvent {
  return "startDate" in event;
}

export interface SchoolYearData {
  schoolYear: string;
  lastUpdated: string;
  events: SchoolEvent[];
}

export interface Config {
  currentYear: string;
  schoolName: string;
  repoOwner: string;
  repoName: string;
  calendarName: string;
  calendarDescription: string;
}

export interface PublishedEvent {
  title: string;
  type: EventType;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive, same as start for single-day)
  allDay: boolean;
  description?: string;
}

export interface PublishedEventsFile {
  schoolYear: string;
  lastUpdated: string;
  generatedAt: string;
  events: PublishedEvent[];
}
