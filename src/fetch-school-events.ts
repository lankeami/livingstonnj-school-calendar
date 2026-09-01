import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ApiResponse, SchoolEventsFile } from "./school-events.js";
import { filterSchoolEvents, buildFetchUrl } from "./school-events.js";
import type { Config } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function main(): Promise<void> {
  const config = JSON.parse(readFileSync(join(root, "config.json"), "utf-8")) as Config;
  const year = config.currentYear;

  const [startYear] = year.split("-").map(Number);
  const startDate = `${startYear}-07-01`;
  const endDate = `${startYear + 1}-06-30`;

  const outDir = join(root, "data", "school-events");
  const outPath = join(outDir, `${year}.json`);

  const force = process.argv.includes("--force");

  if (!force && existsSync(outPath)) {
    const cached = JSON.parse(readFileSync(outPath, "utf-8")) as SchoolEventsFile;
    console.log(`Cache hit: data/school-events/${year}.json (${cached.events.length} events, fetched ${cached.fetchedAt})`);
    console.log("Run with --force to re-fetch.");
    return;
  }

  const url = buildFetchUrl(startDate, endDate);
  console.log(`Fetching ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

  const payload = await res.json() as ApiResponse;
  if (!payload.success || !Array.isArray(payload.data?.events)) {
    throw new Error(`Unexpected API shape: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const events = filterSchoolEvents(payload.data.events);
  const feedIds = new Set(events.map(e => e.feed_id));
  console.log(`  ${payload.data.events.length} raw → ${events.length} school events across ${feedIds.size} feeds`);

  const file: SchoolEventsFile = {
    schoolYear: year,
    fetchedAt: new Date().toISOString().slice(0, 10),
    events,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(file, null, 2), "utf-8");
  console.log(`  → data/school-events/${year}.json`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
