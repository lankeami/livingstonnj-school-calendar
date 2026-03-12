# Design: Calendar Event Deep Links

**Date:** 2026-03-12
**Status:** Approved

## Summary

Add a `URL:` field to each ICS calendar event that deep-links to the corresponding event card on the GitHub Pages site. The domain is configurable via `config.json` but defaults to the derived GitHub.io URL.

## Goals

- Each subscribed calendar event links directly to its card on the pages site
- Clicking the link in a calendar app (Google, Apple, Outlook) opens the page scrolled to that event
- Domain is configurable for non-GitHub-Pages deployments

## Non-Goals

- Unique anchors for same-date events (date collisions are rare; first card wins)
- Individual event detail pages (single-page app stays as-is)

## Changes

### 1. `config.json` + `src/types.ts` — Add optional `siteUrl`

Add an optional `siteUrl` field to `config.json` (trailing slash required):

```json
{
  "siteUrl": "https://lankeami.github.io/livingstonnj-school-calendar/"
}
```

Add to the `Config` interface in `src/types.ts`:

```ts
siteUrl?: string;
```

If `siteUrl` is absent, it is derived at build time from the existing `repoOwner` and `repoName` fields (both already present in `Config`):

```
https://{repoOwner}.github.io/{repoName}/
```

**Warning:** If `repoOwner` still contains the placeholder value `YOUR_GITHUB_USERNAME`, the derived URL will be broken. Either set a valid `repoOwner` in `config.json` or provide an explicit `siteUrl` before distributing the ICS files.

Existing configs with no `siteUrl` continue to work without modification once `repoOwner` is set.

### 2. `src/generate-ics.ts` — Add `url` to event attributes

`src/generate-ics.ts` already exports `buildEventAttributes(data, config)`, which iterates over `data.events` and builds an `EventAttributes[]`. This is where the `url` field is added.

The function signature is already `buildEventAttributes(data: SchoolYearData, config: Config)` — no signature changes are needed. Resolve `siteUrl` once at the top of `buildEventAttributes`, normalizing the trailing slash:

```ts
const rawSiteUrl = config.siteUrl ?? `https://${config.repoOwner}.github.io/${config.repoName}/`;
const siteUrl = rawSiteUrl.endsWith("/") ? rawSiteUrl : rawSiteUrl + "/";
```

For each event, add a `url` field using the event's start date as the hash anchor. The raw data types are `SingleDayEvent` (with `event.date`) and `MultiDayEvent` (with `event.startDate`):

- Single-day event (`isSingleDay`): `url: \`${siteUrl}#${event.date}\``
- Multi-day event (`isMultiDay`): `url: \`${siteUrl}#${event.startDate}\``

The `ics` library writes this as `URL:` in the ICS output, which calendar apps surface as a clickable link on the event.

### 3. `docs/app.js` — Anchor data attributes + hash-based scroll

Events rendered in `docs/app.js` are `PublishedEvent` objects (from `events.json`), which use `event.start` (not `event.date`) for the start date.

**Add `data-date` to each event card** inside `renderEvents()`, rather than using `id` (which would be invalid HTML when two events share a start date):

```js
card.dataset.date = event.start;  // e.g. "2026-09-07"
```

**Hash-based scroll** — inside `renderEvents()`, replace the final scroll block with logic that checks `window.location.hash` first, falling back to scroll-to-today:

```js
const hash = window.location.hash.slice(1); // strip leading "#"
const hashTarget = hash ? document.querySelector(`[data-date="${hash}"]`) : null;

if (hashTarget) {
  hashTarget.scrollIntoView({ behavior: "smooth", block: "start" });
} else if (scrollTarget) {
  scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

This code goes inside `renderEvents()`, after the event loop, **replacing the entire existing block** (lines 154–156):

```js
// REMOVE this block:
if (scrollTarget) {
  scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

The replacement snippet preserves the `scrollTarget` null guard in the `else if` branch, so it is safe when no upcoming events exist (e.g. mid-summer). The `scrollTarget` variable is in scope here.

## Data Flow

```
config.json (siteUrl or repoOwner+repoName)
  → generate-ics.ts buildEventAttributes() (resolve + normalize siteUrl,
      append #YYYY-MM-DD to each event url)
  → docs/calendars/YYYY-YYYY.ics  (URL: https://.../#2026-09-07)
  → Calendar app shows link on event

docs/app.js renderEvents()
  → card.dataset.date = event.start  (e.g. "2026-09-07")
  → after render: check window.location.hash → querySelector([data-date])
      → scroll to match, or fall back to scroll-to-today
```

## Anchor Collision

If two events share a start date, `document.querySelector('[data-date="YYYY-MM-DD"]')` returns the first matching card in DOM order (i.e., the first event rendered for that date). This is acceptable given the rarity of same-date events in a school calendar. Using `data-date` instead of `id` keeps the HTML valid.

## Testing

1. `npm run build` — verify no TypeScript errors
2. Open `docs/index.html` locally; choose a known event start date from `docs/events.json` (e.g. the first event's `start` value). Navigate to `index.html#{that-date}` — confirm the page scrolls to that event card.
3. Verify that navigating to `index.html` without a hash still scrolls to the first upcoming event (today-anchor fallback).
4. Import the generated ICS into a calendar app — confirm each event shows a clickable URL that opens the page at the correct card.
