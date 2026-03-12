import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateIcs } from "./generate-ics.js";
import { isSingleDay, isMultiDay } from "./types.js";
import type { Config, SchoolYearData, PublishedEvent, PublishedEventsFile } from "./types.js";

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

function main(): void {
  const config = readJson<Config>(join(root, "config.json"));
  const activeYears = config.activeYears ?? [config.currentYear];

  console.log(`Active years: ${activeYears.join(", ")}`);

  // Generate per-year ICS files and collect all events
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

  // Sort combined events chronologically
  allPublishedEvents.sort((a, b) => a.start.localeCompare(b.start));

  // latest.ics = merged calendar across all active years
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
  console.log(`  → docs/calendars/latest.ics (${allPublishedEvents.length} total events)`);

  // events.json — all events combined
  const eventsFile: PublishedEventsFile = {
    schoolYear: activeYears.join(" + "),
    lastUpdated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    events: allPublishedEvents,
  };

  const eventsJsonPath = join(root, "docs", "events.json");
  writeFileSync(eventsJsonPath, JSON.stringify(eventsFile, null, 2), "utf-8");
  console.log(`  → docs/events.json`);

  console.log(`\nBuild complete! ${allPublishedEvents.length} total events across ${activeYears.length} year(s).`);
  console.log(`\nSubscribe URL (after GitHub Pages deploy):`);
  console.log(
    `  webcal://${config.repoOwner}.github.io/${config.repoName}/calendars/latest.ics`
  );
}

main();
