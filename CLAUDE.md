# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation
***IMPORTANT*** we normally put documentation in the `docs/` directory, however that is reserved for github pages. store all documentation in the `.claude/docs` directory instead.

## Commands

```bash
npm run build                  # compile TypeScript + generate docs/ output files
npm run typecheck              # type-check without emitting
npm run new-year -- YYYY-YYYY  # scaffold a new school year
npm test                       # run tests (src/*.test.ts compiled + executed via node:test)
npm run fetch-school-events    # fetch per-school events → data/school-events/<year>.json (cached)
./scripts/fetch-school-events.sh  # thin wrapper for the above
```

The build is the verification step — if `npm run build` succeeds, the output is correct. Tests additionally guard the school-event pipeline and the `latest.ics` golden file.

## Data sources

**District calendar (closures, PD days, first/last day):** hand-edited `data/YYYY-YYYY.json` — source of truth, never overridden by school feeds.

**Per-school events (concerts, Back to School Night, etc.):** district JSON API — unauthenticated, read-only.
- Endpoint: `https://www.livingston.org/api/calendars/145838/events`
- `start_date` and `end_date` are **required** query params (shorter `start`/`end` return HTTP 400)
- `feed_ids[]` is accepted but **ignored** by the server — filtering must happen client-side
- Public Google `.ics` URLs for individual feeds return **HTTP 404** — the JSON API is the only ingestion path
- Feed 27083 (LPS District Calendar) restates the PDF and must be excluded; only the 9 school feeds in `FEED_MAP` are ingested
- School attribution comes from `feed_id` via `FEED_MAP` in `src/school-events.ts` — never from the event title prefix
- `data/school-events/YYYY-YYYY.json` is **generated** (run `npm run fetch-school-events`), unlike the hand-edited `data/YYYY-YYYY.json`
- Re-running fetch is a no-op if the file exists; delete it to force a refresh
- Per-school subscribe URLs follow the pattern: `webcal://<siteUrl>/calendars/<school-slug>-YYYY-YYYY.ics`

## Architecture

Three-layer pipeline:

1. **`config.json`** — declares `currentYear` (e.g. `"2026-2027"`). This is the only file to change when rolling over to a new year (or use `npm run new-year`).

2. **`data/YYYY-YYYY.json`** — hand-edited source of truth. Events use a discriminated union: single-day events have `"date"`, multi-day events have `"startDate"` + `"endDate"` (both inclusive). The TypeScript types in `src/types.ts` (`isSingleDay` / `isMultiDay` type guards) reflect this exactly.

3. **`docs/`** — GitHub Pages root. All files here except `index.html`, `style.css`, and `app.js` are **generated** by the build and should not be hand-edited:
   - `docs/calendars/YYYY-YYYY.ics` — versioned calendar
   - `docs/calendars/latest.ics` — stable subscribe URL (never changes, always points to current year)
   - `docs/events.json` — consumed by `docs/app.js` for the landing page event list

### ICS generation (RFC 5545)

`DTEND` for all-day events is **exclusive** per RFC 5545. `src/generate-ics.ts` adds one day to every `endDate` before writing to ICS. The `data/` JSON always stores **inclusive** dates. Do not change this behavior — calendar apps (Google, Apple, Outlook) depend on it.

UIDs are deterministic: `{title-slug}-{start-date}@livingston-schools`. This prevents duplicate events on re-import.

### Annual rollover

```bash
npm run new-year -- 2027-2028
# → creates data/2027-2028.json with NJ state holidays pre-filled
# → updates config.json currentYear to "2027-2028"
# Edit data/2027-2028.json with district events from the PDF
npm run build
git add -A && git commit -m "Add 2027-2028 school calendar"
git push
```

### GitHub Pages / deploy

Push to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build` and deploys `docs/` to GitHub Pages. No manual deploy step. Before first deploy, update `config.json` `repoOwner` and enable Pages (Settings → Pages → Source: GitHub Actions).

### `docs/app.js`

Derives the ICS URL dynamically from `window.location` so the same code works both locally (file:// or localhost) and on GitHub Pages. The `webcal://` URL is constructed by replacing the `https://` scheme — this is the URL used for Google/Apple subscribe buttons.
