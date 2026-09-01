import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTargetMonth,
  yearsCoveringMonth,
  daysOffForMonth,
  monthLabel,
} from "./lookahead.js";
import type { SchoolEvent } from "./types.js";

// --- resolveTargetMonth: the two-month planning horizon -----------------------

test("resolveTargetMonth returns the month two calendar months ahead", () => {
  assert.equal(resolveTargetMonth("2026-08-26"), "2026-10");
  assert.equal(resolveTargetMonth("2026-08-01"), "2026-10");
  assert.equal(resolveTargetMonth("2026-08-31"), "2026-10");
});

test("resolveTargetMonth crosses the calendar-year boundary", () => {
  assert.equal(resolveTargetMonth("2026-11-15"), "2027-01");
  assert.equal(resolveTargetMonth("2026-12-01"), "2027-02");
  assert.equal(resolveTargetMonth("2026-10-31"), "2026-12");
});

test("resolveTargetMonth rejects malformed dates", () => {
  assert.throws(() => resolveTargetMonth("2026-8-1"), /Invalid date/);
  assert.throws(() => resolveTargetMonth("not-a-date"), /Invalid date/);
});

// --- yearsCoveringMonth: which data/*.json files to load ---------------------

const ACTIVE = ["2025-2026", "2026-2027", "2027-2028"];

test("yearsCoveringMonth picks the single school year owning a mid-year month", () => {
  assert.deepEqual(yearsCoveringMonth("2026-10", ACTIVE), ["2026-2027"]);
  assert.deepEqual(yearsCoveringMonth("2027-01", ACTIVE), ["2026-2027"]);
  assert.deepEqual(yearsCoveringMonth("2027-06", ACTIVE), ["2026-2027"]);
});

test("yearsCoveringMonth returns both years for a summer month they share", () => {
  // August 2027 is the tail of 2026-2027 and the run-up to 2027-2028 —
  // late-August PD days can be filed in either year's data file.
  assert.deepEqual(yearsCoveringMonth("2027-08", ACTIVE), ["2026-2027", "2027-2028"]);
});

test("yearsCoveringMonth returns nothing for a month outside every active year", () => {
  assert.deepEqual(yearsCoveringMonth("2024-10", ACTIVE), []);
  assert.deepEqual(yearsCoveringMonth("2029-03", ACTIVE), []);
});

test("yearsCoveringMonth rejects a malformed month", () => {
  assert.throws(() => yearsCoveringMonth("2026-1", ACTIVE), /Invalid month/);
});

// --- daysOffForMonth: classification, clipping, weekend exclusion ------------

const events: SchoolEvent[] = [
  { title: "Columbus Day - No School", date: "2026-10-12", type: "no-school", allDay: true },
  { title: "Yom Kippur - District Closed", date: "2026-09-21", type: "holiday", allDay: true },
  {
    title: "Conferences - Early Dismissal",
    startDate: "2026-10-28",
    endDate: "2026-10-30",
    type: "early-dismissal",
    allDay: true,
  },
  {
    title: "Delayed Opening for Students/Staff PD",
    date: "2026-10-20",
    type: "school",
    allDay: true,
    description: "Delayed opening",
  },
  { title: "First Day for Students", date: "2026-10-01", type: "first-day", allDay: true },
];

test("daysOffForMonth keeps only events touching the target month", () => {
  const report = daysOffForMonth("2026-10", events);
  const titles = [...report.fullDaysOff, ...report.partialDays, ...report.otherEvents].map(
    (e) => e.title
  );
  assert.ok(!titles.includes("Yom Kippur - District Closed"));
  assert.equal(titles.length, 4);
});

test("daysOffForMonth separates full days off from partial days", () => {
  const report = daysOffForMonth("2026-10", events);

  assert.deepEqual(
    report.fullDaysOff.map((e) => e.title),
    ["Columbus Day - No School"]
  );
  assert.deepEqual(
    report.partialDays.map((e) => e.title),
    ["Delayed Opening for Students/Staff PD", "Conferences - Early Dismissal"]
  );
  assert.deepEqual(
    report.otherEvents.map((e) => e.title),
    ["First Day for Students"]
  );
});

test("daysOffForMonth counts distinct weekdays, not events", () => {
  const report = daysOffForMonth("2026-10", events);
  assert.equal(report.fullDaysOffCount, 1);
  // Oct 20 delayed opening + Oct 28/29/30 conferences = 4 weekdays
  assert.equal(report.partialDaysCount, 4);
});

test("daysOffForMonth excludes weekend days from the coverage count", () => {
  // Spring Recess 2027-04-19 (Mon) through 2027-04-23 (Fri) — 5 weekdays.
  const spring: SchoolEvent[] = [
    {
      title: "Spring Recess - Schools Closed",
      startDate: "2027-04-19",
      endDate: "2027-04-23",
      type: "break",
      allDay: true,
    },
  ];
  const report = daysOffForMonth("2027-04", spring);
  assert.equal(report.fullDaysOff[0].weekdayCount, 5);
  assert.equal(report.fullDaysOffCount, 5);

  // A span crossing a weekend counts only its weekdays.
  const crossing: SchoolEvent[] = [
    {
      title: "Winter Recess - District Closed",
      startDate: "2026-12-24",
      endDate: "2026-12-31",
      type: "break",
      allDay: true,
    },
  ];
  const winter = daysOffForMonth("2026-12", crossing);
  // Dec 24,25,28,29,30,31 are weekdays; Dec 26/27 fall on a weekend.
  assert.equal(winter.fullDaysOff[0].weekdayCount, 6);
});

test("daysOffForMonth clips a span that starts before or ends after the month", () => {
  const straddling: SchoolEvent[] = [
    {
      title: "Winter Recess - District Closed",
      startDate: "2026-12-24",
      endDate: "2027-01-01",
      type: "break",
      allDay: true,
    },
  ];
  const january = daysOffForMonth("2027-01", straddling);
  const entry = january.fullDaysOff[0];

  assert.equal(entry.start, "2027-01-01");
  assert.equal(entry.end, "2027-01-01");
  assert.equal(entry.originalStart, "2026-12-24");
  assert.equal(entry.originalEnd, "2027-01-01");
  assert.equal(entry.weekdayCount, 1); // 2027-01-01 is a Friday
});

test("daysOffForMonth does not double-count a weekday that is both full and partial", () => {
  const overlapping: SchoolEvent[] = [
    { title: "Columbus Day - No School", date: "2026-10-12", type: "no-school", allDay: true },
    { title: "Early Dismissal", date: "2026-10-12", type: "early-dismissal", allDay: true },
  ];
  const report = daysOffForMonth("2026-10", overlapping);
  assert.equal(report.fullDaysOffCount, 1);
  assert.equal(report.partialDaysCount, 0);
});

test("daysOffForMonth de-duplicates identical events from two school-year files", () => {
  const duplicated: SchoolEvent[] = [
    { title: "Professional Development", date: "2027-08-30", type: "no-school", allDay: true },
    { title: "Professional Development", date: "2027-08-30", type: "no-school", allDay: true },
  ];
  const report = daysOffForMonth("2027-08", duplicated);
  assert.equal(report.fullDaysOff.length, 1);
  assert.equal(report.fullDaysOffCount, 1);
});

test("daysOffForMonth sorts each section chronologically", () => {
  const unsorted: SchoolEvent[] = [
    { title: "Later", date: "2026-10-20", type: "holiday", allDay: true },
    { title: "Earlier", date: "2026-10-05", type: "holiday", allDay: true },
  ];
  const report = daysOffForMonth("2026-10", unsorted);
  assert.deepEqual(
    report.fullDaysOff.map((e) => e.title),
    ["Earlier", "Later"]
  );
});

test("daysOffForMonth returns an empty report for a month with no events", () => {
  const report = daysOffForMonth("2027-05", events);
  assert.equal(report.month, "2027-05");
  assert.deepEqual(report.fullDaysOff, []);
  assert.deepEqual(report.partialDays, []);
  assert.deepEqual(report.otherEvents, []);
  assert.equal(report.fullDaysOffCount, 0);
  assert.equal(report.partialDaysCount, 0);
});

// --- monthLabel --------------------------------------------------------------

test("monthLabel renders a human-readable month", () => {
  assert.equal(monthLabel("2026-10"), "October 2026");
  assert.equal(monthLabel("2027-01"), "January 2027");
});
