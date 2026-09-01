// Raw shape returned by the district API
export interface ApiEvent {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS ("00:00:00" for all-day)
  end_date: string;   // YYYY-MM-DD (exclusive for all-day per Google convention)
  end_time: string;
  all_day: boolean;
  description: string;
  address: string;
  calendar_name: string;
  feed_id: number;
}

export interface ApiResponse {
  success: boolean;
  data: { events: ApiEvent[] };
}

// Enriched with school name resolved from feed_id
export interface SchoolApiEvent {
  id: string;
  feed_id: number;
  school: string;
  title: string;
  start_date: string;
  end_date: string; // exclusive for all-day (Google convention), inclusive = start_date for timed
  start_time: string;
  end_time: string;
  all_day: boolean;
  description: string;
  address: string;
}

export interface SchoolEventsFile {
  schoolYear: string;
  fetchedAt: string;
  events: SchoolApiEvent[];
}

export const FEED_MAP: Record<number, string> = {
  27085: "Burnet Hill Elementary",
  27087: "Collins Elementary",
  27088: "Harrison Elementary",
  27089: "Hillside Elementary",
  27091: "Mt. Pleasant Middle",
  27092: "Heritage Middle",
  27094: "Riker Hill Elementary",
  27095: "Mt. Pleasant Elementary",
  27096: "Livingston High School",
};

// feed 27083 = LPS District Calendar (restates the PDF — exclude)
// feed 145838 = self-referential "Calendar: District Calendar" row — excluded implicitly
// (only feeds in FEED_MAP are kept)
export const FEED_ABBR: Record<number, string> = {
  27085: "BHE",
  27087: "COL",
  27088: "HAR",
  27089: "HIL",
  27091: "MPM",
  27092: "HMS",
  27094: "RHE",
  27095: "MPE",
  27096: "LHS",
};

// All known prefixes per school (including alt abbreviations like CO:, CES: for Collins)
const PREFIX_PATTERNS: Record<number, string[]> = {
  27085: ["BHE"],
  27087: ["COL", "CO", "CES"],
  27088: ["HAR"],
  27089: ["HIL"],
  27091: ["MPM"],
  27092: ["HMS"],
  27094: ["RHE"],
  27095: ["MPE"],
  27096: ["LHS"],
};

export const SCHOOL_FEED_IDS = new Set(Object.keys(FEED_MAP).map(Number));

// Strip any known school prefix from a title, then prepend [ABBR].
// Only strips when the abbreviation is followed by a clear separator (: - space),
// never when it's the start of a longer word (e.g. "Collins" starts with "Col").
export function formatSchoolTitle(feedId: number, rawTitle: string): string {
  const abbr = FEED_ABBR[feedId];
  const patterns = PREFIX_PATTERNS[feedId] ?? [];
  let title = rawTitle;
  for (const pat of patterns) {
    // Require a word boundary after the abbreviation, then optional separator chars
    const re = new RegExp(`^${pat}(?=[:\\-\\s])\\s*[:;\\-]?\\s*`, "i");
    if (re.test(title)) {
      title = title.replace(re, "");
      break;
    }
  }
  return `[${abbr}] ${title}`;
}

// Keep only the 9 school feeds; attribute each event's school via feed_id, never title prefix.
export function filterSchoolEvents(events: ApiEvent[]): SchoolApiEvent[] {
  return events
    .filter(e => SCHOOL_FEED_IDS.has(e.feed_id))
    .map(e => ({
      id: e.id,
      feed_id: e.feed_id,
      school: FEED_MAP[e.feed_id],
      title: formatSchoolTitle(e.feed_id, e.title),
      start_date: e.start_date,
      end_date: e.end_date,
      start_time: e.start_time,
      end_time: e.end_time,
      all_day: e.all_day,
      description: e.description,
      address: e.address,
    }));
}

// Grouping key for render-time deduplication.
// Uses raw (lowercased) title — school prefixes like "HAR ", "HIL: ", "RHE: " naturally
// differentiate per-school events; events that are truly district-wide have the same title
// on every feed (e.g. "District Art Show").
export function groupingKey(event: SchoolApiEvent): string {
  const title = event.title.toLowerCase().trim();
  const time = event.all_day ? "allday" : event.start_time.substring(0, 5);
  return `${title}|${event.start_date}|${time}`;
}

export interface EventGroup {
  title: string;
  start_date: string;
  end_date: string;
  start_time: string;
  all_day: boolean;
  schools: string[];
  events: SchoolApiEvent[]; // all (event, school) pairs preserved — never dropped
}

// Group events for display. All stored records are preserved in `events`; grouping is
// reversible. A false-collapse (same name, same time, different schools like "Popsicles
// with the Principal") keeps both records because the raw titles differ.
export function groupEvents(events: SchoolApiEvent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of events) {
    const key = groupingKey(event);
    const existing = groups.get(key);
    if (existing) {
      if (!existing.schools.includes(event.school)) existing.schools.push(event.school);
      existing.events.push(event);
    } else {
      groups.set(key, {
        title: event.title,
        start_date: event.start_date,
        end_date: event.end_date,
        start_time: event.start_time,
        all_day: event.all_day,
        schools: [event.school],
        events: [event],
      });
    }
  }
  return Array.from(groups.values());
}

// API endpoint — start_date and end_date are REQUIRED (shorter `start`/`end` returns 400).
// feed_ids[] is accepted but ignored by the server; filter client-side.
export const API_URL = "https://www.livingston.org/api/calendars/145838/events";

export function buildFetchUrl(startDate: string, endDate: string): string {
  return `${API_URL}?start_date=${startDate}&end_date=${endDate}`;
}

export function schoolSlug(school: string): string {
  return school.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
