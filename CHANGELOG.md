# Changelog

## 2026-08-31

- [616a74c](https://github.com/lankeami/livingstonnj-school-calendar/commit/616a74c96097dab505f22f7711c235f75f4b407e) Add per-school event ingestion from district API (#19)
  Ingests nine per-school Google Calendar feeds from the district JSON API (calendarApiId 145838), keeping the district PDF pipeline completely independent so latest.ics and all existing subscribers are unaffected.
