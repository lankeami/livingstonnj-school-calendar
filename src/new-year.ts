import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Config, SchoolYearData } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function getNJHolidays(startYear: number): SchoolYearData["events"] {
  const endYear = startYear + 1;

  // Compute Labor Day (first Monday of September)
  function firstMonday(year: number, month: number): string {
    const date = new Date(year, month - 1, 1);
    const dow = date.getDay(); // 0=Sun
    const offset = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
    return `${year}-${String(month).padStart(2, "0")}-${String(1 + offset).padStart(2, "0")}`;
  }

  // Compute MLK Day (third Monday of January)
  function thirdMonday(year: number, month: number): string {
    const first = new Date(year, month - 1, 1);
    const dow = first.getDay();
    const firstMon = dow === 1 ? 1 : dow === 0 ? 2 : 9 - dow;
    const third = firstMon + 14;
    return `${year}-${String(month).padStart(2, "0")}-${String(third).padStart(2, "0")}`;
  }

  // Presidents Day (third Monday of February)
  function presidentsDay(year: number): string {
    return thirdMonday(year, 2);
  }

  // Memorial Day (last Monday of May)
  function lastMonday(year: number, month: number): string {
    const lastDay = new Date(year, month, 0).getDate();
    const date = new Date(year, month - 1, lastDay);
    const dow = date.getDay();
    const offset = dow === 1 ? 0 : dow === 0 ? -6 : 1 - dow;
    const day = lastDay + offset;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Thanksgiving (4th Thursday of November)
  function thanksgiving(year: number): string {
    const date = new Date(year, 10, 1);
    const dow = date.getDay();
    const firstThursday = dow <= 4 ? 5 - dow : 12 - dow;
    const fourth = firstThursday + 21;
    return `${year}-11-${String(fourth).padStart(2, "0")}`;
  }

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const laborDay = firstMonday(startYear, 9);
  const thanksgivingDay = thanksgiving(startYear);
  const mlkDay = thirdMonday(endYear, 1);
  const preDay = presidentsDay(endYear);
  const memDay = lastMonday(endYear, 5);

  return [
    {
      title: `Labor Day - No School`,
      date: laborDay,
      type: "holiday",
      allDay: true,
    },
    {
      title: "First Day of School (PLACEHOLDER)",
      date: addDays(laborDay, 1),
      type: "first-day",
      allDay: true,
      description: "Update with actual first day from district calendar PDF",
    },
    {
      title: "Thanksgiving Recess (PLACEHOLDER)",
      startDate: thanksgivingDay,
      endDate: addDays(thanksgivingDay, 2),
      type: "break",
      allDay: true,
      description: "Verify exact dates from district calendar PDF",
    },
    {
      title: "Winter Recess (PLACEHOLDER)",
      startDate: `${startYear}-12-24`,
      endDate: `${endYear}-01-02`,
      type: "break",
      allDay: true,
      description: "Verify exact dates from district calendar PDF",
    },
    {
      title: `MLK Day - No School`,
      date: mlkDay,
      type: "holiday",
      allDay: true,
    },
    {
      title: `Presidents Day - No School`,
      date: preDay,
      type: "holiday",
      allDay: true,
    },
    {
      title: "Spring Recess (PLACEHOLDER)",
      startDate: `${endYear}-04-05`,
      endDate: `${endYear}-04-09`,
      type: "break",
      allDay: true,
      description: "Verify exact dates from district calendar PDF",
    },
    {
      title: `Memorial Day - No School`,
      date: memDay,
      type: "holiday",
      allDay: true,
    },
    {
      title: "Last Day of School (PLACEHOLDER)",
      date: `${endYear}-06-15`,
      type: "last-day",
      allDay: true,
      description: "Update with actual last day from district calendar PDF",
    },
  ] as SchoolYearData["events"];
}

function main(): void {
  const args = process.argv.slice(2);
  const yearArg = args[0];

  if (!yearArg) {
    console.error("Usage: npm run new-year -- YYYY-YYYY");
    console.error("Example: npm run new-year -- 2027-2028");
    process.exit(1);
  }

  // Validate format
  const match = yearArg.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    console.error(`Invalid year format: "${yearArg}". Expected YYYY-YYYY (e.g. 2027-2028).`);
    process.exit(1);
  }

  const startYear = parseInt(match[1]);
  const endYear = parseInt(match[2]);

  if (endYear !== startYear + 1) {
    console.error(`Invalid school year: "${yearArg}". End year must be start year + 1.`);
    process.exit(1);
  }

  const dataPath = join(root, "data", `${yearArg}.json`);

  if (existsSync(dataPath)) {
    console.error(`Data file already exists: data/${yearArg}.json`);
    console.error("Delete it first if you want to regenerate the skeleton.");
    process.exit(1);
  }

  // Create skeleton data file
  const today = new Date().toISOString().slice(0, 10);
  const skeleton: SchoolYearData = {
    schoolYear: yearArg,
    lastUpdated: today,
    events: getNJHolidays(startYear),
  };

  writeJson(dataPath, skeleton);
  console.log(`Created data/${yearArg}.json with NJ state holiday skeleton.`);

  // Update config.json
  const configPath = join(root, "config.json");
  const config = readJson<Config>(configPath);
  config.currentYear = yearArg;
  config.calendarName = `Livingston Schools ${yearArg}`;
  writeJson(configPath, config);
  console.log(`Updated config.json: currentYear → "${yearArg}"`);

  console.log(`
Next steps:
  1. Fill in district-specific events in data/${yearArg}.json
     (cross-reference the district's PDF calendar at livingston.org)
  2. Run: npm run build
  3. Verify the generated docs/ files look correct
  4. git add -A && git commit -m "Add ${yearArg} school calendar"
  5. git push  → GitHub Actions deploys automatically
`);
}

main();
