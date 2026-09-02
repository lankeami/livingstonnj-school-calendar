const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

// Add VTIMEZONE block and TZID to timed DTSTART/DTEND (not VALUE=DATE all-day events)
export function applyEasternTimezone(ics: string): string {
  return ics
    .replace(
      "X-PUBLISHED-TTL:PT1H",
      `X-PUBLISHED-TTL:PT1H\r\nX-WR-TIMEZONE:America/New_York\r\n${VTIMEZONE}`
    )
    .replace(/^(DTSTART|DTEND):(\d{8}T\d{6})$/gm, "$1;TZID=America/New_York:$2");
}
