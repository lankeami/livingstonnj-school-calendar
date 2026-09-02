import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "fs";
import { join } from "path";
import { createEvents, type EventAttributes } from "ics";

// --- Inline types & maps (avoids ESM import issues in Vercel serverless) ---

interface SchoolYearData {
  schoolYear: string;
  lastUpdated: string;
  events: Array<{
    title: string;
    type: string;
    allDay: boolean;
    description?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

interface SchoolApiEvent {
  id: string;
  feed_id: number;
  school: string;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  description: string;
  address: string;
}

interface SchoolEventsFile {
  schoolYear: string;
  fetchedAt: string;
  events: SchoolApiEvent[];
}

const ABBR_TO_SCHOOL: Record<string, string> = {
  BHE: "Burnet Hill Elementary",
  COL: "Collins Elementary",
  HAR: "Harrison Elementary",
  HIL: "Hillside Elementary",
  MPM: "Mt. Pleasant Middle",
  HMS: "Heritage Middle",
  RHE: "Riker Hill Elementary",
  MPE: "Mt. Pleasant Elementary",
  LHS: "Livingston High School",
};

const SITE_URL = "https://livingston-nj-school-calendar.com/";

// --- Helpers ---

function parseDate(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

function addOneDay(s: string): [number, number, number] {
  const date = new Date(s + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h, m];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// --- Build ICS event attributes ---

function districtAttrs(data: SchoolYearData): EventAttributes[] {
  const attrs: EventAttributes[] = [];
  for (const event of data.events) {
    if (event.date) {
      const start = parseDate(event.date);
      const end = addOneDay(event.date);
      attrs.push({
        uid: `${slugify(event.title)}-${event.date}@livingston-schools`,
        title: event.title,
        start, end,
        startInputType: "local", startOutputType: "local",
        endInputType: "local", endOutputType: "local",
        description: event.description ?? `${SITE_URL}#${event.date}`,
        categories: [event.type],
      });
    } else if (event.startDate && event.endDate) {
      const start = parseDate(event.startDate);
      const end = addOneDay(event.endDate);
      attrs.push({
        uid: `${slugify(event.title)}-${event.startDate}@livingston-schools`,
        title: event.title,
        start, end,
        startInputType: "local", startOutputType: "local",
        endInputType: "local", endOutputType: "local",
        description: event.description ?? `${SITE_URL}#${event.startDate}`,
        categories: [event.type],
      });
    }
  }
  return attrs;
}

function schoolAttrs(events: SchoolApiEvent[]): EventAttributes[] {
  return events.map(event => {
    const uid = `${event.id}@livingston-schools`;
    const desc = event.description
      ? event.description.replace(/<[^>]*>/g, " ").trim()
      : SITE_URL;

    if (event.all_day) {
      const [sy, sm, sd] = parseDate(event.start_date);
      const [ey, em, ed] = parseDate(event.end_date);
      return {
        uid, title: event.title,
        start: [sy, sm, sd] as [number, number, number],
        end: [ey, em, ed] as [number, number, number],
        startInputType: "local" as const, startOutputType: "local" as const,
        endInputType: "local" as const, endOutputType: "local" as const,
        description: desc, categories: ["school"],
        ...(event.address ? { location: event.address } : {}),
      };
    }

    const [sy, sm, sd] = parseDate(event.start_date);
    const [sh, smin] = parseHHMM(event.start_time);
    const [ey, em, ed] = parseDate(event.end_date);
    const [eh, emin] = parseHHMM(event.end_time);
    return {
      uid, title: event.title,
      start: [sy, sm, sd, sh, smin] as [number, number, number, number, number],
      end: [ey, em, ed, eh, emin] as [number, number, number, number, number],
      startInputType: "local" as const, startOutputType: "local" as const,
      endInputType: "local" as const, endOutputType: "local" as const,
      description: desc, categories: ["school"],
      ...(event.address ? { location: event.address } : {}),
    };
  });
}

// --- Handler ---

export default function handler(req: VercelRequest, res: VercelResponse) {
  const root = join(process.cwd());

  // Parse ?schools=LHS,HIL,HAR
  const schoolsParam = (req.query.schools as string) ?? "";
  const requestedAbbrs = schoolsParam
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(s => s in ABBR_TO_SCHOOL);

  const requestedSchools = new Set(requestedAbbrs.map(a => ABBR_TO_SCHOOL[a]));

  // Always include district events from all active years
  const config = readJson<{ activeYears?: string[]; currentYear: string }>(
    join(root, "config.json")
  );
  const activeYears = config.activeYears ?? [config.currentYear];

  const allAttrs: EventAttributes[] = [];

  for (const year of activeYears) {
    const data = readJson<SchoolYearData>(join(root, "data", `${year}.json`));
    allAttrs.push(...districtAttrs(data));
  }

  // Add selected school events
  if (requestedSchools.size > 0) {
    for (const year of activeYears) {
      try {
        const schoolData = readJson<SchoolEventsFile>(
          join(root, "data", "school-events", `${year}.json`)
        );
        const filtered = schoolData.events.filter(e => requestedSchools.has(e.school));
        allAttrs.push(...schoolAttrs(filtered));
      } catch {
        // school events file may not exist for older years
      }
    }
  }

  // Build calendar name from selection
  const calName = requestedAbbrs.length > 0
    ? `Livingston NJ Schools (${requestedAbbrs.join(", ")})`
    : "Livingston NJ School Calendar";

  const { error, value } = createEvents(allAttrs, { calName });

  if (error || !value) {
    res.status(500).send(`ICS generation failed: ${error}`);
    return;
  }

  const VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\r\n");

  const ics = value
    .replace(
      "X-PUBLISHED-TTL:PT1H",
      `X-PUBLISHED-TTL:PT1H\r\nX-WR-TIMEZONE:America/New_York\r\n${VTIMEZONE}`
    )
    .replace(/^(DTSTART|DTEND):(\d{8}T\d{6})$/gm, "$1;TZID=America/New_York:$2");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=livingston-schools.ics");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(ics);
}
