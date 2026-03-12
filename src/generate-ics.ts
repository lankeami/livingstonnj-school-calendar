import { createEvents, type EventAttributes } from "ics";
import { SchoolYearData, Config, isSingleDay, isMultiDay } from "./types.js";

function parseDate(dateStr: string): [number, number, number] {
  const [year, month, day] = dateStr.split("-").map(Number);
  return [year, month, day];
}

function addOneDay(dateStr: string): [number, number, number] {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  ];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildEventAttributes(
  data: SchoolYearData,
  config: Config
): EventAttributes[] {
  const attrs: EventAttributes[] = [];

  for (const event of data.events) {
    if (isSingleDay(event)) {
      const start = parseDate(event.date);
      // DTEND for all-day single-day is exclusive: same date + 1
      const end = addOneDay(event.date);
      const uid = `${slugify(event.title)}-${event.date}@livingston-schools`;

      attrs.push({
        uid,
        title: event.title,
        start,
        end,
        startInputType: "local",
        startOutputType: "local",
        endInputType: "local",
        endOutputType: "local",
        description: event.description,
        categories: [event.type],
      });
    } else if (isMultiDay(event)) {
      const start = parseDate(event.startDate);
      // DTEND is exclusive per RFC 5545 — add one day to inclusive endDate
      const end = addOneDay(event.endDate);
      const uid = `${slugify(event.title)}-${event.startDate}@livingston-schools`;

      attrs.push({
        uid,
        title: event.title,
        start,
        end,
        startInputType: "local",
        startOutputType: "local",
        endInputType: "local",
        endOutputType: "local",
        description: event.description,
        categories: [event.type],
      });
    }
  }

  return attrs;
}

export function generateIcs(data: SchoolYearData, config: Config): string {
  const eventAttrs = buildEventAttributes(data, config);

  const { error, value } = createEvents(eventAttrs, {
    calName: config.calendarName,
  });

  if (error || !value) {
    throw new Error(`ICS generation failed: ${error}`);
  }

  return value;
}
