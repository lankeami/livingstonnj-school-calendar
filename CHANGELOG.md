# Changelog

## 2026-09-01

- [7052803](https://github.com/lankeami/livingstonnj-school-calendar/commit/7052803e8aed3693e92cd1c17e1f5cc7483737e6) Prefix school event titles with [ABBR] and strip redundant school prefixes
  Adds FEED_ABBR map and formatSchoolTitle() that strips known school prefixes (HAR, HIL:, BHE-, RHE:, CO:, CES:, etc.) then prepends [ABBR] so calendar entries read '[HAR] Back to School Night' instead of 'HAR Back to School Night'. Unprefixed events like 'SAT Registration' become '[LHS] SAT Registration'.

## 2026-08-31

- [616a74c](https://github.com/lankeami/livingstonnj-school-calendar/commit/616a74c96097dab505f22f7711c235f75f4b407e) Add per-school event ingestion from district API (#19)
  Ingests nine per-school Google Calendar feeds from the district JSON API (calendarApiId 145838), keeping the district PDF pipeline completely independent so latest.ics and all existing subscribers are unaffected.
