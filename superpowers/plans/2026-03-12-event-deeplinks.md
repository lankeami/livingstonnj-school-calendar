# Calendar Event Deep Links Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `URL:` field to every ICS calendar event linking to the event's card on the GitHub Pages site, with hash-anchor deep linking on the page.

**Architecture:** Add `siteUrl` (optional) to `Config`; resolve it in `buildEventAttributes` and attach it as a `url` field per event in the ICS output. On the frontend, stamp each event card with `data-date` and use `window.location.hash` to scroll to the matching card on load, falling back to scroll-to-today.

**Tech Stack:** TypeScript (`ics` npm library for ICS generation), vanilla JS (`docs/app.js`), `config.json` for runtime configuration.

---

> **No test suite exists in this project.** The build (`npm run build`) and type-check (`npm run typecheck`) are the verification steps. Run them after every task.

---

## Chunk 1: Types + ICS generation

### Task 1: Add `siteUrl` to the `Config` type

**Files:**
- Modify: `src/types.ts`

The `Config` interface currently ends at line 50. Add one optional field.

- [ ] **Step 1: Open `src/types.ts` and add `siteUrl?` to `Config`**

  Find the `Config` interface (it starts at line 42). Add the new field after `calendarDescription`:

  ```ts
  export interface Config {
    currentYear: string;
    activeYears?: string[];
    schoolName: string;
    repoOwner: string;
    repoName: string;
    calendarName: string;
    calendarDescription: string;
    siteUrl?: string;  // ← add this line
  }
  ```

- [ ] **Step 2: Verify types compile**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/types.ts
  git commit -m "feat: add optional siteUrl to Config type"
  ```

---

### Task 2: Add `url` field to ICS event attributes

**Files:**
- Modify: `src/generate-ics.ts`

`buildEventAttributes` (line 26) already receives `config: Config`. Add `siteUrl` resolution at the top of the function body and attach `url` to each event's attributes inside the existing `isSingleDay` and `isMultiDay` branches.

- [ ] **Step 1: Resolve `siteUrl` at the top of `buildEventAttributes`**

  After the opening brace of `buildEventAttributes` (line 30, before `const attrs`), insert:

  ```ts
  const rawSiteUrl = config.siteUrl ?? `https://${config.repoOwner}.github.io/${config.repoName}/`;
  const siteUrl = rawSiteUrl.endsWith("/") ? rawSiteUrl : rawSiteUrl + "/";
  ```

- [ ] **Step 2: Add `url` to the single-day branch**

  Inside the `isSingleDay` branch, the `attrs.push({...})` call currently ends with `categories: [event.type]`. Add `url` after it:

  ```ts
  attrs.push({
    uid,
    title: event.title,
    start,
    end,
    startInputType: "local",
    startOutputType: "local",
    endInputType: "local",
    endOutputType: "local",
    description: event.description,
    categories: [event.type],
    url: `${siteUrl}#${event.date}`,  // ← add this line
  });
  ```

- [ ] **Step 3: Add `url` to the multi-day branch**

  Inside the `isMultiDay` branch, same pattern — add `url` after `categories`:

  ```ts
  attrs.push({
    uid,
    title: event.title,
    start,
    end,
    startInputType: "local",
    startOutputType: "local",
    endInputType: "local",
    endOutputType: "local",
    description: event.description,
    categories: [event.type],
    url: `${siteUrl}#${event.startDate}`,  // ← add this line
  });
  ```

- [ ] **Step 4: Verify types compile**

  ```bash
  npm run typecheck
  ```

  Expected: no errors. If the `ics` library's `EventAttributes` type doesn't include `url`, check the installed version:

  ```bash
  node -e "const {createEvents} = require('ics'); console.log('ok')"
  ```

  The `url` field is supported in `ics` v3+. If you get a type error on `url`, check `node_modules/ics/dist/types.d.ts` — it should include `url?: string` in `EventAttributes`.

- [ ] **Step 5: Run the full build**

  ```bash
  npm run build
  ```

  Expected: build succeeds. Check that `docs/calendars/latest.ics` now contains `URL:` lines:

  ```bash
  grep "^URL:" docs/calendars/latest.ics | head -5
  ```

  Expected output (URLs will vary based on your `config.json`):
  ```
  URL:https://lankeami.github.io/livingstonnj-school-calendar/#2025-09-02
  URL:https://lankeami.github.io/livingstonnj-school-calendar/#2025-09-03
  ...
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/generate-ics.ts
  git commit -m "feat: add URL deep-link to each ICS event"
  ```

---

## Chunk 2: Frontend + config

### Task 3: Add `data-date` anchors and hash-based scroll to `docs/app.js`

**Files:**
- Modify: `docs/app.js`

Two changes inside `renderEvents()`:
1. Stamp each event card with `data-date`
2. Replace the final scroll block with hash-aware logic

- [ ] **Step 1: Add `data-date` to each event card**

  Inside the `for (const event of events)` loop (around line 117), after `card.className = ...`, add:

  ```js
  card.dataset.date = event.start;  // enables deep-link anchoring
  ```

  The full card creation block should look like:

  ```js
  const card = document.createElement("div");
  card.className = `event-card ${event.type}`;
  card.dataset.date = event.start;  // ← add this line
  ```

- [ ] **Step 2: Replace the scroll block at the bottom of `renderEvents()`**

  Find the existing scroll block (lines 154–156):

  ```js
  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  ```

  Replace the entire block with:

  ```js
  const hash = window.location.hash.slice(1); // strip leading "#"
  const hashTarget = hash ? document.querySelector(`[data-date="${hash}"]`) : null;

  if (hashTarget) {
    hashTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  ```

- [ ] **Step 3: Verify the build still passes**

  ```bash
  npm run build
  ```

  Expected: no errors (build doesn't compile `docs/app.js`, but it does regenerate `docs/events.json` which the page depends on).

- [ ] **Step 4: Manually test deep-link scrolling**

  Open `docs/index.html` in a browser. Find a known event start date from `docs/events.json`:

  ```bash
  node -e "const e=require('./docs/events.json'); console.log(e.events[0].start)"
  ```

  Navigate to `docs/index.html#{that-date}` (e.g. `file:///path/to/docs/index.html#2025-09-02`).

  Expected: page loads and smoothly scrolls to the event card for that date.

- [ ] **Step 5: Manually test fallback scroll (no hash)**

  Navigate to `docs/index.html` (no hash). Expected: page scrolls to the first upcoming event as before.

- [ ] **Step 6: Commit**

  ```bash
  git add docs/app.js
  git commit -m "feat: add data-date anchors and hash-based scroll to event cards"
  ```

---

### Task 4: Add `siteUrl` to `config.json`

**Files:**
- Modify: `config.json`

This step is optional if `repoOwner` is already set to a valid GitHub username (the URL will be derived correctly). If the `repoOwner` is still `YOUR_GITHUB_USERNAME`, set `siteUrl` explicitly instead.

- [ ] **Step 1: Add `siteUrl` to `config.json`**

  Add the field (adjust the URL to match your actual GitHub Pages domain):

  ```json
  {
    "currentYear": "2026-2027",
    "activeYears": ["2025-2026", "2026-2027"],
    "schoolName": "Livingston School District",
    "repoOwner": "lankeami",
    "repoName": "livingstonnj-school-calendar",
    "calendarName": "Livingston Schools",
    "calendarDescription": "Official school calendar for the Livingston, NJ School District",
    "siteUrl": "https://lankeami.github.io/livingstonnj-school-calendar/"
  }
  ```

  > If `repoOwner` is correct and matches your GitHub username, you can skip adding `siteUrl` — the derived URL will be identical. Setting it explicitly is clearer and protects against future `repoOwner` changes.

- [ ] **Step 2: Run final build and verify URLs**

  ```bash
  npm run build
  grep "^URL:" docs/calendars/latest.ics | head -3
  ```

  Expected: all `URL:` lines point to your actual GitHub Pages domain.

- [ ] **Step 3: Commit**

  ```bash
  git add config.json
  git commit -m "config: add explicit siteUrl for calendar event deep links"
  ```
