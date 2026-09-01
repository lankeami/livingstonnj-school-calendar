import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateIcs } from "./generate-ics.js";
import { generateSchoolIcs } from "./generate-school-ics.js";
import { isSingleDay, isMultiDay } from "./types.js";
import { schoolSlug } from "./school-events.js";
import type { Config, SchoolYearData, PublishedEvent, PublishedEventsFile } from "./types.js";
import type { SchoolEventsFile, SchoolApiEvent } from "./school-events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function toPublishedEvents(data: SchoolYearData): PublishedEvent[] {
  return data.events.map((event) => {
    if (isSingleDay(event)) {
      return {
        title: event.title,
        type: event.type,
        start: event.date,
        end: event.date,
        allDay: event.allDay,
        description: event.description,
      };
    } else if (isMultiDay(event)) {
      return {
        title: event.title,
        type: event.type,
        start: event.startDate,
        end: event.endDate,
        allDay: event.allDay,
        description: event.description,
      };
    }
    throw new Error(`Unknown event shape: ${JSON.stringify(event)}`);
  });
}

function schoolEventToPublished(e: SchoolApiEvent): PublishedEvent {
  // For all-day school events, end_date from API is exclusive (Google convention);
  // convert to inclusive for our PublishedEvent convention.
  let endInclusive = e.end_date;
  if (e.all_day && e.end_date !== e.start_date) {
    const d = new Date(e.end_date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    endInclusive = d.toISOString().slice(0, 10);
  }
  return {
    title: e.title,
    type: "school",
    start: e.start_date,
    end: e.all_day ? endInclusive : e.start_date,
    allDay: e.all_day,
    school: e.school,
    startTime: e.all_day ? undefined : e.start_time.substring(0, 5),
  };
}

function main(): void {
  const config = readJson<Config>(join(root, "config.json"));
  const activeYears = config.activeYears ?? [config.currentYear];

  console.log(`Active years: ${activeYears.join(", ")}`);

  // Generate per-year district ICS files and collect district events
  const allPublishedEvents: PublishedEvent[] = [];
  ensureDir(join(root, "docs", "calendars", "placeholder"));

  for (const year of activeYears) {
    const dataPath = join(root, "data", `${year}.json`);
    const data = readJson<SchoolYearData>(dataPath);

    const icsContent = generateIcs(data, config);
    const versionedIcsPath = join(root, "docs", "calendars", `${year}.ics`);
    writeFileSync(versionedIcsPath, icsContent, "utf-8");
    console.log(`  → docs/calendars/${year}.ics (${data.events.length} events)`);

    allPublishedEvents.push(...toPublishedEvents(data));
  }

  // Sort district events chronologically
  allPublishedEvents.sort((a, b) => a.start.localeCompare(b.start));

  // latest.ics = district-only, unchanged by school pipeline
  const mergedData: SchoolYearData = {
    schoolYear: activeYears.join(" + "),
    lastUpdated: new Date().toISOString().slice(0, 10),
    events: allPublishedEvents.map((e) =>
      e.start === e.end
        ? { title: e.title, type: e.type, allDay: e.allDay, date: e.start, description: e.description }
        : { title: e.title, type: e.type, allDay: e.allDay, startDate: e.start, endDate: e.end, description: e.description }
    ),
  };

  const latestIcsPath = join(root, "docs", "calendars", "latest.ics");
  writeFileSync(latestIcsPath, generateIcs(mergedData, config), "utf-8");
  console.log(`  → docs/calendars/latest.ics (${allPublishedEvents.length} district events)`);

  // Per-school ICS files — only if data/school-events/<year>.json exists
  const allSchoolEvents: PublishedEvent[] = [];
  for (const year of activeYears) {
    const schoolDataPath = join(root, "data", "school-events", `${year}.json`);
    if (!existsSync(schoolDataPath)) continue;

    const schoolData = readJson<SchoolEventsFile>(schoolDataPath);
    const bySchool = new Map<string, SchoolApiEvent[]>();

    for (const event of schoolData.events) {
      const list = bySchool.get(event.school) ?? [];
      list.push(event);
      bySchool.set(event.school, list);
    }

    for (const [school, events] of bySchool) {
      const slug = schoolSlug(school);
      const icsContent = generateSchoolIcs(events, school, config);
      const icsPath = join(root, "docs", "calendars", `${slug}-${year}.ics`);
      writeFileSync(icsPath, icsContent, "utf-8");
      console.log(`  → docs/calendars/${slug}-${year}.ics (${events.length} events)`);
    }

    allSchoolEvents.push(...schoolData.events.map(schoolEventToPublished));
  }

  // events.json — district events always present; school events appended when available
  const combinedEvents = [...allPublishedEvents, ...allSchoolEvents];
  combinedEvents.sort((a, b) => a.start.localeCompare(b.start));

  const eventsFile: PublishedEventsFile = {
    schoolYear: activeYears.join(" + "),
    lastUpdated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    events: combinedEvents,
  };

  const eventsJsonPath = join(root, "docs", "events.json");
  writeFileSync(eventsJsonPath, JSON.stringify(eventsFile, null, 2), "utf-8");
  console.log(`  → docs/events.json (${allPublishedEvents.length} district + ${allSchoolEvents.length} school events)`);

  const totalDistrict = allPublishedEvents.length;
  const totalSchool = allSchoolEvents.length;
  console.log(`\nBuild complete! ${totalDistrict} district + ${totalSchool} school events.`);
  console.log(`\nSubscribe URL (after GitHub Pages deploy):`);
  console.log(`  webcal://${config.repoOwner}.github.io/${config.repoName}/calendars/latest.ics`);
}

main();
