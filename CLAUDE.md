# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation
***IMPORTANT*** we normally put documentation in the `docs/` directory, however that is reserved for github pages. store all documentation in the `.claude/docs` directory instead.

## Commands

```bash
npm run build        # compile TypeScript + generate docs/ output files
npm run typecheck    # type-check without emitting
npm run test         # node:test over compiled dist/ (no test framework dependency)
npm run new-year -- YYYY-YYYY  # scaffold a new school year
npm run lookahead    # days off in the calendar month two months ahead
```

The only tested code is `src/lookahead.ts` — pure date arithmetic, where a build cannot
catch an off-by-one month. Everything else is verified by the build: if `npm run build`
succeeds, the generated output is correct. Do not add a test framework dependency;
`npm test` deliberately uses node's built-in runner.

## Architecture

Three-layer pipeline:

1. **`config.json`** — declares `activeYears` (the years the build turns into calendars) and `currentYear` (the school year in session). **`activeYears` is what drives the build** — `src/build.ts` iterates it, so a year absent from it produces no `.ics` no matter what else is configured; `currentYear` is only its fallback when `activeYears` is missing entirely.

   Do not roll a year over by hand — run `npm run new-year -- YYYY-YYYY`, which adds the year to `activeYears`, derives `currentYear` from today's date (a `YYYY-YYYY` school year starts July 1 of `YYYY`; `--today YYYY-MM-DD` overrides it for testing), and leaves `calendarName` alone. `calendarName` is operator-owned: it becomes `X-WR-CALNAME` in `latest.ics`, which is the subscription's display name in every subscriber's calendar app, and that feed merges *all* `activeYears`, so no single year's name would be correct there.

2. **`data/YYYY-YYYY.json`** — hand-edited source of truth. Events use a discriminated union: single-day events have `"date"`, multi-day events have `"startDate"` + `"endDate"` (both inclusive). The TypeScript types in `src/types.ts` (`isSingleDay` / `isMultiDay` type guards) reflect this exactly.

3. **`docs/`** — GitHub Pages root. All files here except `index.html`, `style.css`, and `app.js` are **generated** by the build and should not be hand-edited:
   - `docs/calendars/YYYY-YYYY.ics` — versioned calendar
   - `docs/calendars/latest.ics` — stable subscribe URL (never changes, always points to current year)
   - `docs/events.json` — consumed by `docs/app.js` for the landing page event list

### ICS generation (RFC 5545)

`DTEND` for all-day events is **exclusive** per RFC 5545. `src/generate-ics.ts` adds one day to every `endDate` before writing to ICS. The `data/` JSON always stores **inclusive** dates. Do not change this behavior — calendar apps (Google, Apple, Outlook) depend on it.

UIDs are deterministic: `{title-slug}-{start-date}@livingston-schools`. This prevents duplicate events on re-import.

### Days-off lookahead

`src/lookahead.ts` (`npm run lookahead`, surfaced as the `/days-off-lookahead` skill)
reports the days off in the calendar month **two months ahead** — the lead time a
time-off request or a camp booking actually needs.

It reads `config.json` and `data/YYYY-YYYY.json` — the source of truth — **never
`docs/`**, which is generated and would go stale between builds. It writes nothing.

The exported functions (`resolveTargetMonth`, `yearsCoveringMonth`, `daysOffForMonth`)
are pure and covered by `src/lookahead.test.ts`; only the CLI at the bottom of the file
touches the filesystem. Two behaviors are load-bearing and have tests guarding them:
weekend days inside a multi-day break are excluded from the coverage count, and a month
covered by two `activeYears` files (August, at the school-year seam) de-duplicates
events rather than counting them twice.

`resolveCurrentSchoolYear` from `src/school-year.ts` is imported, not reimplemented —
the July 1 rule already exists in two places (there and `scripts/fetch-calendars.sh`)
and does not need a third.

### Annual rollover

```bash
npm run new-year -- 2027-2028
# → creates data/2027-2028.json with NJ state holidays pre-filled
# → adds "2027-2028" to config.json activeYears (in order, idempotent)
# → sets config.json currentYear from today's date, not from the year argument
#   (so scaffolding next year's calendar early does not retire the year in session)
# → leaves calendarName untouched
# Edit data/2027-2028.json with district events from the PDF
npm run build
git add -A && git commit -m "Add 2027-2028 school calendar"
git push
```

### GitHub Pages / deploy

Push to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build` and deploys `docs/` to GitHub Pages. No manual deploy step. Before first deploy, update `config.json` `repoOwner` and enable Pages (Settings → Pages → Source: GitHub Actions).

### `docs/app.js`

Derives the ICS URL dynamically from `window.location` so the same code works both locally (file:// or localhost) and on GitHub Pages. The `webcal://` URL is constructed by replacing the `https://` scheme — this is the URL used for Google/Apple subscribe buttons.
