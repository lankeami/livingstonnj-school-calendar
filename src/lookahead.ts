/**
 * Days-off lookahead.
 *
 * Answers "what school days off are coming that I need to plan for?" for the
 * calendar month two months ahead — run it in August and it reports October.
 * Two months is the horizon because employer time-off requests and sitter or
 * camp bookings need that much lead time.
 *
 * Reads `data/YYYY-YYYY.json` (the hand-edited source of truth), never
 * `docs/` (generated). Read-only: this script writes nothing.
 *
 * The exported functions are pure — the CLI at the bottom is the only part
 * that touches the filesystem.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { resolveCurrentSchoolYear } from "./school-year.js";
import { isSingleDay, isMultiDay } from "./types.js";
import type { Config, EventType, SchoolEvent, SchoolYearData } from "./types.js";

/** How many calendar months ahead the planning window sits. */
export const LOOKAHEAD_MONTHS = 2;

/** Event types that close school for the whole day. */
const FULL_DAY_OFF_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  "holiday",
  "no-school",
  "break",
]);

/** Event types that shorten the day rather than cancel it. */
const PARTIAL_DAY_TYPES: ReadonlySet<EventType> = new Set<EventType>(["early-dismissal"]);

/**
 * Delayed openings are filed as `type: "school"` with the wording in the
 * description or title, so they need a text match rather than a type match.
 */
const DELAYED_OPENING = /delayed opening/i;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DayOffEntry {
  title: string;
  type: EventType;
  /** First day of the event inside the target month (YYYY-MM-DD, inclusive). */
  start: string;
  /** Last day of the event inside the target month (YYYY-MM-DD, inclusive). */
  end: string;
  /** The event's own span, before clipping to the month. */
  originalStart: string;
  originalEnd: string;
  /** Mon–Fri days in the clipped span — the days that actually need cover. */
  weekdayCount: number;
  description?: string;
}

export interface MonthReport {
  /** YYYY-MM */
  month: string;
  label: string;
  fullDaysOff: DayOffEntry[];
  partialDays: DayOffEntry[];
  otherEvents: DayOffEntry[];
  /** Distinct weekdays fully off. */
  fullDaysOffCount: number;
  /** Distinct weekdays shortened but not already counted as fully off. */
  partialDaysCount: number;
}

// --- date helpers ------------------------------------------------------------

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = parseDate(date).getUTCDay();
  return day === 0 || day === 6;
}

/** Every date from `start` to `end`, both inclusive. */
function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(toIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseMonth(month: string): { year: number; month: number } {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid month: "${month}". Expected YYYY-MM.`);
  }
  const monthNumber = parseInt(match[2], 10);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month: "${month}". Month must be 01–12.`);
  }
  return { year: parseInt(match[1], 10), month: monthNumber };
}

/** First and last date of a `YYYY-MM` month, both inclusive. */
function monthBounds(month: string): { first: string; last: string } {
  const { year, month: m } = parseMonth(month);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// --- pure core ---------------------------------------------------------------

/**
 * The `YYYY-MM` month `LOOKAHEAD_MONTHS` calendar months after `today`
 * (a YYYY-MM-DD date). August 2026 → `2026-10`; November 2026 → `2027-01`.
 */
export function resolveTargetMonth(today: string, monthsAhead = LOOKAHEAD_MONTHS): string {
  const match = today.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) {
    throw new Error(`Invalid date: "${today}". Expected YYYY-MM-DD.`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid date: "${today}". Month must be 01–12.`);
  }

  const index = month - 1 + monthsAhead;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;

  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  const { year, month: m } = parseMonth(month);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/**
 * Which `activeYears` data files could hold events for `month`.
 *
 * The July 1 rule lives in `resolveCurrentSchoolYear` — it is not restated
 * here. August is the one seam month: the late-August staff days that open a
 * school year are sometimes filed in the outgoing year's data file, so August
 * resolves to two candidates and callers must de-duplicate — `daysOffForMonth`
 * does.
 */
export function yearsCoveringMonth(month: string, activeYears: string[]): string[] {
  const { year, month: m } = parseMonth(month);

  const candidates = new Set([resolveCurrentSchoolYear(`${month}-01`)]);
  if (m === 8) candidates.add(`${year - 1}-${year}`);

  return activeYears.filter((schoolYear) => candidates.has(schoolYear));
}

function spanOf(event: SchoolEvent): { start: string; end: string } {
  if (isSingleDay(event)) return { start: event.date, end: event.date };
  if (isMultiDay(event)) return { start: event.startDate, end: event.endDate };
  throw new Error(`Unknown event shape: ${JSON.stringify(event)}`);
}

function isPartial(event: SchoolEvent): boolean {
  if (PARTIAL_DAY_TYPES.has(event.type)) return true;
  const text = `${event.title} ${event.description ?? ""}`;
  return DELAYED_OPENING.test(text);
}

/**
 * Classify and clip every event touching `month`.
 *
 * Full days off, partial days, and everything else (first/last day, ordinary
 * school events) are kept in separate sections — nothing is silently dropped.
 * Counts are of *distinct weekdays*, not of events: overlapping events on one
 * day count once, and a day that is fully off is never also counted partial.
 */
export function daysOffForMonth(month: string, events: SchoolEvent[]): MonthReport {
  const { first, last } = monthBounds(month);

  const seen = new Set<string>();
  const fullDaysOff: DayOffEntry[] = [];
  const partialDays: DayOffEntry[] = [];
  const otherEvents: DayOffEntry[] = [];
  const fullDates = new Set<string>();
  const partialDates = new Set<string>();

  for (const event of events) {
    const { start, end } = spanOf(event);
    if (end < first || start > last) continue;

    const key = `${event.title}|${start}|${end}|${event.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const clippedStart = start < first ? first : start;
    const clippedEnd = end > last ? last : end;
    const dates = eachDate(clippedStart, clippedEnd);
    const weekdays = dates.filter((date) => !isWeekend(date));

    const entry: DayOffEntry = {
      title: event.title,
      type: event.type,
      start: clippedStart,
      end: clippedEnd,
      originalStart: start,
      originalEnd: end,
      weekdayCount: weekdays.length,
      ...(event.description ? { description: event.description } : {}),
    };

    if (FULL_DAY_OFF_TYPES.has(event.type)) {
      fullDaysOff.push(entry);
      for (const date of weekdays) fullDates.add(date);
    } else if (isPartial(event)) {
      partialDays.push(entry);
      for (const date of weekdays) partialDates.add(date);
    } else {
      otherEvents.push(entry);
    }
  }

  const byDate = (a: DayOffEntry, b: DayOffEntry): number =>
    a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  fullDaysOff.sort(byDate);
  partialDays.sort(byDate);
  otherEvents.sort(byDate);

  for (const date of fullDates) partialDates.delete(date);

  return {
    month,
    label: monthLabel(month),
    fullDaysOff,
    partialDays,
    otherEvents,
    fullDaysOffCount: fullDates.size,
    partialDaysCount: partialDates.size,
  };
}

// --- CLI ---------------------------------------------------------------------

export interface CliOptions {
  /** Explicit `YYYY-MM` to report on, overriding the two-month default. */
  month?: string;
  /** Resolve the default month as of this date instead of today. */
  today?: string;
  json: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--today") {
      options.today = argv[++i];
    } else if (arg.startsWith("--today=")) {
      options.today = arg.slice("--today=".length);
    } else if (/^\d{4}-\d{2}$/.test(arg)) {
      options.month = arg;
    } else {
      throw new Error(
        `Unknown argument: "${arg}"\n` +
          `Usage: npm run lookahead -- [YYYY-MM] [--today YYYY-MM-DD] [--json]`
      );
    }
  }

  if (options.today && !/^\d{4}-\d{2}-\d{2}$/.test(options.today)) {
    throw new Error(`Invalid --today: "${options.today}". Expected YYYY-MM-DD.`);
  }

  return options;
}

function formatDay(date: string): string {
  return `${WEEKDAY_NAMES[parseDate(date).getUTCDay()]} ${date}`;
}

function formatSpan(entry: DayOffEntry): string {
  if (entry.start === entry.end) return formatDay(entry.start);
  return `${formatDay(entry.start)} → ${formatDay(entry.end)}`;
}

function formatSection(title: string, entries: DayOffEntry[], emptyNote: string): string[] {
  if (entries.length === 0) return [`${title}: ${emptyNote}`, ""];

  const lines = [title];
  for (const entry of entries) {
    const days =
      entry.weekdayCount === 0
        ? " (weekend only)"
        : entry.weekdayCount > 1
          ? ` (${entry.weekdayCount} weekdays)`
          : "";
    lines.push(`  ${formatSpan(entry)}  ${entry.title}${days}`);
    const clipped =
      entry.originalStart !== entry.start || entry.originalEnd !== entry.end
        ? `    part of ${entry.originalStart} → ${entry.originalEnd}`
        : "";
    if (clipped) lines.push(clipped);
  }
  lines.push("");
  return lines;
}

export function formatReport(report: MonthReport, asOf: string, years: string[]): string {
  const lines: string[] = [];
  lines.push(`Days off to plan for — ${report.label}`);
  lines.push(
    `as of ${asOf} · school year${years.length > 1 ? "s" : ""} ${years.join(", ") || "(none)"}`
  );
  lines.push("");

  if (
    report.fullDaysOff.length === 0 &&
    report.partialDays.length === 0 &&
    report.otherEvents.length === 0
  ) {
    lines.push(`No days off in ${report.label} — nothing to plan for.`);
    lines.push("");
    return lines.join("\n");
  }

  lines.push(
    ...formatSection(
      `Full days off — ${report.fullDaysOffCount} weekday${report.fullDaysOffCount === 1 ? "" : "s"} to cover`,
      report.fullDaysOff,
      "none"
    )
  );
  lines.push(
    ...formatSection(
      `Partial days (early dismissal / delayed opening) — ${report.partialDaysCount} weekday${
        report.partialDaysCount === 1 ? "" : "s"
      }`,
      report.partialDays,
      "none"
    )
  );
  if (report.otherEvents.length > 0) {
    lines.push(...formatSection("Also this month", report.otherEvents, "none"));
  }

  return lines.join("\n");
}

function loadEvents(root: string, years: string[]): { events: SchoolEvent[]; missing: string[] } {
  const events: SchoolEvent[] = [];
  const missing: string[] = [];

  for (const year of years) {
    try {
      const data = JSON.parse(
        readFileSync(join(root, "data", `${year}.json`), "utf-8")
      ) as SchoolYearData;
      events.push(...data.events);
    } catch {
      missing.push(year);
    }
  }

  return { events, missing };
}

function main(argv: string[]): void {
  const options = parseArgs(argv);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  const asOf = options.today ?? new Date().toISOString().slice(0, 10);
  const month = options.month ?? resolveTargetMonth(asOf);

  const config = JSON.parse(readFileSync(join(root, "config.json"), "utf-8")) as Config;
  const activeYears = config.activeYears ?? [config.currentYear];
  const years = yearsCoveringMonth(month, activeYears);

  const { events, missing } = loadEvents(root, years);
  const report = daysOffForMonth(month, events);

  if (options.json) {
    console.log(JSON.stringify({ asOf, schoolYears: years, missingYears: missing, ...report }, null, 2));
  } else {
    if (years.length === 0) {
      console.log(
        `No active school year covers ${monthLabel(month)}. ` +
          `Active years: ${activeYears.join(", ")}.`
      );
      console.log(`Run \`npm run new-year -- YYYY-YYYY\` to scaffold it.\n`);
    }
    for (const year of missing) {
      console.log(`WARNING: data/${year}.json not found — skipping that year.`);
    }
    console.log(formatReport(report, asOf, years));
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
