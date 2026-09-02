import { createEvents, type EventAttributes } from "ics";
import type { SchoolApiEvent } from "./school-events.js";
import type { Config } from "./types.js";

function parseDate(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h, m];
}

export function generateSchoolIcs(events: SchoolApiEvent[], school: string, config: Config): string {
  const rawSiteUrl = config.siteUrl ?? `https://${config.repoOwner}.github.io/${config.repoName}/`;
  const siteUrl = rawSiteUrl.endsWith("/") ? rawSiteUrl : rawSiteUrl + "/";

  const attrs: EventAttributes[] = events.map(event => {
    const uid = `${event.id}@livingston-schools`;
    const desc = event.description ? event.description.replace(/<[^>]*>/g, " ").trim() : siteUrl;

    if (event.all_day) {
      const [sy, sm, sd] = parseDate(event.start_date);
      const [ey, em, ed] = parseDate(event.end_date); // end_date already exclusive (Google convention)
      return {
        uid,
        title: event.title,
        start: [sy, sm, sd] as [number, number, number],
        end: [ey, em, ed] as [number, number, number],
        startInputType: "local" as const,
        startOutputType: "local" as const,
        endInputType: "local" as const,
        endOutputType: "local" as const,
        description: desc,
        categories: ["school"],
        ...(event.address ? { location: event.address } : {}),
      };
    }

    const [sy, sm, sd] = parseDate(event.start_date);
    const [sh, smin] = parseHHMM(event.start_time);
    const [ey, em, ed] = parseDate(event.end_date);
    const [eh, emin] = parseHHMM(event.end_time);

    return {
      uid,
      title: event.title,
      start: [sy, sm, sd, sh, smin] as [number, number, number, number, number],
      end: [ey, em, ed, eh, emin] as [number, number, number, number, number],
      startInputType: "local" as const,
      startOutputType: "local" as const,
      endInputType: "local" as const,
      endOutputType: "local" as const,
      description: desc,
      categories: ["school"],
      ...(event.address ? { location: event.address } : {}),
    };
  });

  const { error, value } = createEvents(attrs, {
    calName: `${school} — Livingston NJ Schools`,
  });

  if (error || !value) throw new Error(`ICS generation failed for ${school}: ${error}`);

  // Inject X-WR-TIMEZONE so calendar apps interpret local times as Eastern
  return value.replace(
    "X-PUBLISHED-TTL:PT1H",
    "X-PUBLISHED-TTL:PT1H\r\nX-WR-TIMEZONE:America/New_York"
  );
}
