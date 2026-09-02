# Changelog

## 2026-09-02

- [a49f7dc](https://github.com/lankeami/livingstonnj-school-calendar/commit/a49f7dc59bf893b57f2504d85671599586678398) Show event times on the website under the date
  School events with times now display the start time (e.g. "6:45 PM") beneath the date in event cards. District events remain date-only.
- [f4a8ce9](https://github.com/lankeami/livingstonnj-school-calendar/commit/f4a8ce9988000109223748101505ad8fd3d85b8f) Fix timezone: add VTIMEZONE block and TZID to timed events
  X-WR-TIMEZONE alone is not honored by Google Calendar. Add a proper VTIMEZONE component for America/New_York and TZID parameter on every timed DTSTART/DTEND so all calendar apps interpret times correctly.
- [6d2abae](https://github.com/lankeami/livingstonnj-school-calendar/commit/6d2abaeb3d0af7c6cacb55df61489664303270a3) Fix school event times showing 4 hours early in calendar apps
  ICS files lacked a timezone declaration, so calendar apps interpreted local times as UTC. Added X-WR-TIMEZONE:America/New_York to per-school ICS files and the Vercel API endpoint.

## 2026-09-01

- [a5dd7ad](https://github.com/lankeami/livingstonnj-school-calendar/commit/a5dd7adbfe5f9aa7460aa3727f66423307e5a165) Add refresh-school-events skill and --force flag for re-fetching
  - npm run refresh-school-events: one-liner to re-fetch + rebuild - .claude/skills/refresh-school-events: automated refresh + ship workflow - fetch-school-events.ts accepts --force to skip cache check
- [ca88cf8](https://github.com/lankeami/livingstonnj-school-calendar/commit/ca88cf8b8ddef09356a53d6e250556401a72d6dc) Add school picker UI, dynamic subscribe URLs, and Vercel API endpoint
  - Unified school picker with checkboxes + View Calendar button that commits selection and scrolls to todays events - All subscribe buttons (header, main, footer) dynamically reflect school selection via /api/calendar?schools=... endpoint - Vercel serverless function merges district + selected school events into a single ICS feed - URL params (?schools=LHS,HAR) for bookmarkable school selections - Select schools link in header for quick access to school picker - Checkbox changes update subscribe panel without scrolling; Go button triggers scroll and URL update
- [7052803](https://github.com/lankeami/livingstonnj-school-calendar/commit/7052803e8aed3693e92cd1c17e1f5cc7483737e6) Prefix school event titles with [ABBR] and strip redundant school prefixes
  Adds FEED_ABBR map and formatSchoolTitle() that strips known school prefixes (HAR, HIL:, BHE-, RHE:, CO:, CES:, etc.) then prepends [ABBR] so calendar entries read '[HAR] Back to School Night' instead of 'HAR Back to School Night'. Unprefixed events like 'SAT Registration' become '[LHS] SAT Registration'.

## 2026-08-31

- [616a74c](https://github.com/lankeami/livingstonnj-school-calendar/commit/616a74c96097dab505f22f7711c235f75f4b407e) Add per-school event ingestion from district API (#19)
  Ingests nine per-school Google Calendar feeds from the district JSON API (calendarApiId 145838), keeping the district PDF pipeline completely independent so latest.ics and all existing subscribers are unaffected.
