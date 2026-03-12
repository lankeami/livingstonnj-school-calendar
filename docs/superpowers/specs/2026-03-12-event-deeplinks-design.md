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

Add an optional `siteUrl` field to `config.json`:

```json
{
  "siteUrl": "https://lankeami.github.io/livingstonnj-school-calendar/"
}
```

Add to the `Config` interface in `src/types.ts`:

```ts
siteUrl?: string;
```

If `siteUrl` is absent, it is derived at build time:

```
https://{repoOwner}.github.io/{repoName}/
```

Existing configs with no `siteUrl` continue to work without modification.

### 2. `src/generate-ics.ts` — Add `url` to event attributes

Resolve `siteUrl` once at the top of `buildEventAttributes`:

```ts
const siteUrl = config.siteUrl ?? `https://${config.repoOwner}.github.io/${config.repoName}/`;
```

For each event, add a `url` field using the event's start date as the hash anchor:

- Single-day event: `url: \`${siteUrl}#${event.date}\``
- Multi-day event: `url: \`${siteUrl}#${event.startDate}\``

The `ics` library writes this as `URL:` in the ICS output, which calendar apps surface as a clickable link on the event.

### 3. `docs/app.js` — Anchor IDs + hash-based scroll

**Add `id` to each event card** during `renderEvents()`:

```js
card.id = event.start;  // e.g. "2026-09-07"
```

**Hash-based scroll on load** — after `renderEvents()` resolves, check `window.location.hash`. If a matching element exists, scroll to it instead of the default "scroll to today" behavior:

```js
const hash = window.location.hash.slice(1); // strip "#"
const target = hash ? document.getElementById(hash) : null;
if (target) {
  target.scrollIntoView({ behavior: "smooth", block: "start" });
} else if (scrollTarget) {
  scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

The existing scroll-to-today logic is preserved as the fallback when no hash is present.

## Data Flow

```
config.json (siteUrl or repoOwner+repoName)
  → generate-ics.ts (resolve siteUrl, append #YYYY-MM-DD to each event url)
  → docs/calendars/YYYY-YYYY.ics (URL: https://.../#2026-09-07)
  → Calendar app shows link on event

docs/app.js renderEvents()
  → card.id = event.start
  → on load: check window.location.hash → scroll to card
```

## Anchor Collision

If two events share a start date, both cards will attempt `id="YYYY-MM-DD"`. HTML allows duplicate IDs but `getElementById` returns the first match — the first rendered card (earliest in the JSON) will be scrolled to. This is acceptable given the rarity of same-date events in a school calendar.

## Testing

1. `npm run build` — verify no TypeScript errors
2. Open `docs/index.html` locally; navigate to `index.html#2026-09-07` — confirm page scrolls to that event card
3. Import the generated ICS into a calendar app — confirm each event shows a clickable URL
