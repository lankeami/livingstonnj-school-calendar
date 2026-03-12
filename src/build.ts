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

function main(): void {
  const config = readJson<Config>(join(root, "config.json"));
  const { currentYear } = config;

  console.log(`Building calendar for ${currentYear}...`);

  const dataPath = join(root, "data", `${currentYear}.json`);
  const data = readJson<SchoolYearData>(dataPath);

  // Generate ICS
  const icsContent = generateIcs(data, config);

  const versionedIcsPath = join(root, "docs", "calendars", `${currentYear}.ics`);
  const latestIcsPath = join(root, "docs", "calendars", "latest.ics");

  ensureDir(versionedIcsPath);
  writeFileSync(versionedIcsPath, icsContent, "utf-8");
  copyFileSync(versionedIcsPath, latestIcsPath);
  console.log(`  → docs/calendars/${currentYear}.ics`);
  console.log(`  → docs/calendars/latest.ics`);

  // Generate events.json
  const publishedEvents: PublishedEvent[] = data.events.map((event) => {
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

  // Sort by start date
  publishedEvents.sort((a, b) => a.start.localeCompare(b.start));

  const eventsFile: PublishedEventsFile = {
    schoolYear: data.schoolYear,
    lastUpdated: data.lastUpdated,
    generatedAt: new Date().toISOString(),
    events: publishedEvents,
  };

  const eventsJsonPath = join(root, "docs", "events.json");
  writeFileSync(eventsJsonPath, JSON.stringify(eventsFile, null, 2), "utf-8");
  console.log(`  → docs/events.json`);

  console.log(`\nBuild complete! ${publishedEvents.length} events processed.`);
  console.log(`\nSubscribe URL (after GitHub Pages deploy):`);
  console.log(
    `  webcal://${config.repoOwner}.github.io/${config.repoName}/calendars/latest.ics`
  );
}

main();
