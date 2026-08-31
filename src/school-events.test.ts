import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterSchoolEvents,
  groupingKey,
  groupEvents,
  buildFetchUrl,
  FEED_MAP,
  SCHOOL_FEED_IDS,
  type ApiEvent,
  type SchoolApiEvent,
} from "./school-events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ── helpers ──────────────────────────────────────────────────────────────────

function makeApiEvent(overrides: Partial<ApiEvent> & { feed_id: number; title: string }): ApiEvent {
  return {
    id: "test-id",
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    start_time: "09:00:00",
    end_time: "10:00:00",
    all_day: false,
    description: "",
    address: "",
    calendar_name: "Test Calendar",
    ...overrides,
  };
}

function makeSchoolEvent(
  id: string,
  feed_id: number,
  school: string,
  title: string,
  start_date: string,
  start_time: string,
  all_day: boolean,
): SchoolApiEvent {
  return {
    id,
    feed_id,
    school,
    title,
    start_date,
    end_date: start_date,
    start_time,
    end_time: start_time,
    all_day,
    description: "",
    address: "",
  };
}

// ── Step 1: feed filter ───────────────────────────────────────────────────────

test("filterSchoolEvents excludes feed 27083 (district) and feed 145838 (self-referential)", () => {
  const events: ApiEvent[] = [
    makeApiEvent({ id: "d1", feed_id: 27083, title: "District Closed" }),
    makeApiEvent({ id: "d2", feed_id: 145838, title: "Calendar: District Calendar" }),
    makeApiEvent({ id: "s1", feed_id: 27085, title: "BHE Open House" }),
    makeApiEvent({ id: "s2", feed_id: 27089, title: "HIL: Back to School Night" }),
    makeApiEvent({ id: "s3", feed_id: 27096, title: "Back to School Night" }),
  ];

  const result = filterSchoolEvents(events);
  assert.equal(result.length, 3);
  assert.ok(result.every(e => e.feed_id !== 27083));
  assert.ok(result.every(e => e.feed_id !== 145838));
});

test("filterSchoolEvents produces exactly 9 unique feed_ids when all school feeds present", () => {
  const events: ApiEvent[] = Object.keys(FEED_MAP).map((fid, i) =>
    makeApiEvent({ id: String(i), feed_id: Number(fid), title: `Event ${i}` }),
  );
  // also add excluded feeds
  events.push(makeApiEvent({ id: "x1", feed_id: 27083, title: "Excluded" }));
  events.push(makeApiEvent({ id: "x2", feed_id: 145838, title: "Also excluded" }));

  const result = filterSchoolEvents(events);
  const feedIds = new Set(result.map(e => e.feed_id));
  assert.equal(feedIds.size, 9);
  assert.ok(!feedIds.has(27083));
  assert.ok(!feedIds.has(145838));
});

// ── Step 3: school attribution ────────────────────────────────────────────────

test("school is always resolved from feed_id, not title prefix", () => {
  const events: ApiEvent[] = [
    // LHS has no prefix on 98 of 99 events
    makeApiEvent({ id: "1", feed_id: 27096, title: "SAT Registration" }),
    // LHS with prefix
    makeApiEvent({ id: "2", feed_id: 27096, title: "LHS Back to School Night" }),
    // Collins with CO: prefix but attribution must still come from feed
    makeApiEvent({ id: "3", feed_id: 27087, title: "CO: Spring Concert" }),
  ];

  const result = filterSchoolEvents(events);
  assert.equal(result.length, 3);
  assert.equal(result[0].school, "Livingston High School");
  assert.equal(result[1].school, "Livingston High School");
  assert.equal(result[2].school, "Collins Elementary");
});

test("all 9 school feeds map to distinct school names", () => {
  const names = Object.values(FEED_MAP);
  assert.equal(new Set(names).size, 9);
});

// ── Step 5: grouping key ──────────────────────────────────────────────────────

test("groupingKey keeps Sep 17 Back to School Nights separate (prefixed titles differ)", () => {
  // Both at 18:45 but prefixed differently
  const harrison = makeSchoolEvent("1", 27088, "Harrison Elementary", "HAR Back to School Night", "2026-09-17", "18:45:00", false);
  const hillside = makeSchoolEvent("2", 27089, "Hillside Elementary", "HIL: Back to School Night", "2026-09-17", "18:45:00", false);

  assert.notEqual(groupingKey(harrison), groupingKey(hillside));
});

test("groupEvents groups District Art Show into one entry with 9 schools", () => {
  const artShowEvents: SchoolApiEvent[] = Object.entries(FEED_MAP).map(([fid, school], i) =>
    makeSchoolEvent(String(i), Number(fid), school, "District Art Show", "2027-05-19", "18:00:00", false),
  );

  const groups = groupEvents(artShowEvents);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].schools.length, 9);
  assert.equal(groups[0].title, "District Art Show");
});

test("Popsicles with the Principal: both records survive (no false-collapse due to prefix)", () => {
  // Hillside: no prefix; Riker Hill: "RHE:  " prefix → different raw titles → different keys
  const hillside = makeSchoolEvent("1", 27089, "Hillside Elementary",
    "Popsicles with the Principal", "2026-08-18", "15:00:00", false);
  const rikerHill = makeSchoolEvent("2", 27094, "Riker Hill Elementary",
    "RHE:  Popsicles with the Principal", "2026-08-18", "15:00:00", false);

  assert.notEqual(groupingKey(hillside), groupingKey(rikerHill));

  const groups = groupEvents([hillside, rikerHill]);
  assert.equal(groups.length, 2);
  // Both original events preserved in stored data
  const allEvents = groups.flatMap(g => g.events);
  assert.equal(allEvents.length, 2);
  assert.ok(allEvents.some(e => e.school === "Hillside Elementary"));
  assert.ok(allEvents.some(e => e.school === "Riker Hill Elementary"));
});

test("groupingKey treats all-day events and midnight-timed events differently", () => {
  const allDay = makeSchoolEvent("1", 27085, "Burnet Hill Elementary", "School Closed", "2026-09-01", "00:00:00", true);
  const timed = makeSchoolEvent("2", 27085, "Burnet Hill Elementary", "School Closed", "2026-09-01", "00:00:00", false);

  assert.notEqual(groupingKey(allDay), groupingKey(timed));
});

// ── Step 7: fetch URL ─────────────────────────────────────────────────────────

test("buildFetchUrl always includes start_date and end_date", () => {
  const url = buildFetchUrl("2026-07-01", "2027-06-30");
  assert.ok(url.includes("start_date=2026-07-01"), "missing start_date");
  assert.ok(url.includes("end_date=2027-06-30"), "missing end_date");
});

test("buildFetchUrl does not include feed_ids (server ignores it anyway)", () => {
  const url = buildFetchUrl("2026-07-01", "2027-06-30");
  assert.ok(!url.includes("feed_ids"), "should not include feed_ids");
});

test("school events file round-trips through JSON serialization", () => {
  const events: SchoolApiEvent[] = [
    makeSchoolEvent("abc123", 27085, "Burnet Hill Elementary", "Open House", "2026-09-10", "17:00:00", false),
  ];
  const file = { schoolYear: "2026-2027", fetchedAt: "2026-08-31", events };
  const parsed = JSON.parse(JSON.stringify(file));
  assert.equal(parsed.events[0].school, "Burnet Hill Elementary");
  assert.equal(parsed.events[0].feed_id, 27085);
  assert.equal(parsed.schoolYear, "2026-2027");
});

// ── Step 9: latest.ics golden-file guard ─────────────────────────────────────

test("latest.ics is not altered by the school event pipeline", () => {
  const stripDtstamp = (s: string) =>
    s.split("\n").filter(l => !l.startsWith("DTSTAMP:")).join("\n");

  const golden = readFileSync(join(root, "test-fixtures", "latest.ics.golden"), "utf-8");
  const actual = readFileSync(join(root, "docs", "calendars", "latest.ics"), "utf-8");

  assert.equal(stripDtstamp(actual), stripDtstamp(golden));
});
