---
description: Report the school days off in the calendar month two months ahead, so there is time to arrange childcare and request time off
---

# Days Off Lookahead

Answer "what school days off are coming that I need to plan for?" for the calendar
month **two months ahead** — run it in August and it reports October.

Two months is the horizon on purpose: employer time-off requests, camp registrations,
and sitter bookings all need that much lead time. One month ahead is already too late.

**Arguments:** `[YYYY-MM] [--today YYYY-MM-DD]`

Examples:
- `/days-off-lookahead` — the default two-month window
- `/days-off-lookahead 2027-04` — a specific month instead
- `/days-off-lookahead --today 2026-11-15` — resolve the window as of a different date (testing)

---

## Steps

### 1. Run the lookahead script

```bash
npm run lookahead --silent -- [YYYY-MM] [--today YYYY-MM-DD]
```

Pass the user's arguments straight through. Add `--json` if you need to post-process
the result; the plain-text output is already the report a parent wants to read.

**Do not compute the target month, classify events, or count weekdays yourself.** The
script owns all of that (`src/lookahead.ts`), it is covered by `npm test`, and a second
implementation in this file would drift from it. Your job is to run it and interpret.

### 2. Read what the script gives back

The report has three sections, and they mean different things to whoever is planning:

- **Full days off** — school is closed. Needs a full day of coverage or a day off work.
  The count is *weekdays*, not events: weekend days inside a multi-day break are
  excluded, because nobody needs to arrange Saturday childcare.
- **Partial days** — early dismissals and delayed openings. School still happens, but
  the drop-off or pick-up time moves. Usually a half-fix (shifted work hours, an
  after-school arrangement), not a full day off.
- **Also this month** — first/last day of school and other noteworthy dates. Context,
  not coverage.

If the month straddles two school years the header names both, and events present in
both data files are counted once.

### 3. Summarize for a parent, not a developer

Lead with the number that drives a decision — how many weekdays need coverage — then
list the dates. Keep it short enough to read on a phone.

Call out anything that deserves early action:
- a multi-day break (needs camp or travel plans, not a sitter)
- two or more days off in the same week
- a full day off adjacent to a weekend or holiday
- a partial day landing on a day that is otherwise normal (easy to miss)

If the report says there are no days off, say so plainly in one line and stop — do not
pad it out.

## Troubleshooting

- **"No active school year covers ..."** — the target month is past the last scaffolded
  year. Run `npm run new-year -- YYYY-YYYY`, then `/fetch-calendars` to populate it.
- **"data/YYYY-YYYY.json not found"** — the year is listed in `config.json` `activeYears`
  but its data file is missing. That is a real inconsistency; report it rather than
  working around it.
- **A day off looks wrong or missing** — the fault is in `data/YYYY-YYYY.json`, the
  hand-edited source of truth. Fix it there and rebuild; never edit `docs/`, which is
  generated.
