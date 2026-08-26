Discover, download, and ingest the district's academic calendar PDFs for the current and next school year, then open a single PR with whatever changed.

**Arguments:** `[YYYY-YYYY ...] [--all] [--today YYYY-MM-DD] [--force]`

Examples:
- `/fetch-calendars` — current + next school year (the normal case)
- `/fetch-calendars 2027-2028` — just that year
- `/fetch-calendars --all` — every year the district has posted
- `/fetch-calendars --force` — re-parse even years whose PDF is byte-identical to the cached copy

This is the automated front door to `/parse-calendar`. It answers "has the district changed anything?" without anyone having to check the website or take a screenshot.

---

## Steps

### 1. Discover what the district has published

```bash
bash scripts/fetch-calendars.sh --list
```

Each row is `YYYY-YYYY<TAB>URL<TAB>label`, where label is `current`, `next`, or `-`.

Source of truth is <https://www.livingston.org/111388>. The script keys on the filename
(`YYYY-YYYY_academic_calendar.pdf`), not the link text, and ignores the other PDFs on that
page such as `reporting_dates_*.pdf`.

If this fails, do not work around it by guessing URLs — read the error, which names the
diagnostic command. A district site redesign is a real change that deserves a real fix.

### 2. Download the calendars

```bash
bash scripts/fetch-calendars.sh --fetch
```

Add `--all` for every published year, or `--today YYYY-MM-DD` to resolve the school year as
of a different date. PDFs land in `.calendar-cache/` (gitignored) alongside a `.sha256` sidecar.

Each row is `YYYY-YYYY<TAB>status<TAB>path`:

| status | meaning | action |
|---|---|---|
| `new` | not previously cached | parse it |
| `changed` | district revised the PDF since last run | parse it |
| `unchanged` | byte-identical to the cached copy | skip, unless `--force` |
| `not-published` | district has not posted this year yet | skip, not an error |

A school year `YYYY-YYYY` is treated as starting July 1 of `YYYY`, so from July onward the
"current" year is the one about to begin.

### 3. Report before doing anything

Show the user the status table, then state plainly which years you are about to parse and
which you are skipping and why. If **every** year is `unchanged` (and `--force` was not
passed), say so and **stop** — there is nothing to ship, and opening an empty PR is noise.

Also flag the case where a year is `new`/`changed` but `data/YYYY-YYYY.json` already exists:
that means the district **revised a calendar that is already published to subscribers**. Call
this out specifically — it is the highest-consequence path, since parents may have already
put the old dates in their own calendars.

### 4. Parse each year that needs it

For each year to parse, follow `/parse-calendar` **steps 2 through 8**, using the cached PDF
at `.calendar-cache/YYYY-YYYY_academic_calendar.pdf` as the source. Do not re-implement that
skill's logic — read it and follow it, including its schema mapping table and its upsert rules.

Two deviations from a normal `/parse-calendar` run:

- **Do not run its step 9** (branch and PR) per year. Ship once, at step 5 below.
- **Consolidate the confirmation gate.** `/parse-calendar` step 5 writes a preview and waits
  for the user. When handling several years, write every preview file first, present one
  combined diff summary covering all of them, and ask for a single confirmation.

Reading the PDF — use both, they catch different mistakes:

```bash
pdftotext -layout .calendar-cache/2027-2028_academic_calendar.pdf -
```

This renders the annotations as readable text (`1 - First Day for Students`,
`10-13 - Spring Recess, Schools Closed`) and is the reliable source for **event names and
day numbers**. Then also open the PDF with the Read tool, which handles PDFs natively, to
confirm the **visual grid** — shading, legend, and which month a stray annotation belongs to.
The text layout interleaves two columns of months, so column confusion is the most likely
parsing error; the visual check is what catches it.

If `pdftotext` is not installed, fall back to the Read tool alone and say so.

Reading notes specific to these PDFs:

- **Bracketed entries are informational, not closures.** `[2-3 Rosh Hashanah]`, `[27 Eid]`,
  `[11-18 Passover, 16 Easter]` mark observances the district notes but does *not* close for.
  Only include them as events if the same date also carries a real closure annotation such as
  `District Closed` or `Schools Closed`.
- **`District Offices Closed` is not a school event.** Per `/parse-calendar`, skip summer
  office-only closures — they have no impact on students or parents.
- **`Schools Closed` vs `District Closed`** both mean no school; the distinction is whether
  the administrative offices are open. Map both by the label in parse-calendar's table.
- The **`N Student Days`** totals per month are a useful cross-check. If your parsed events
  imply a different count for a month, re-read that month before continuing.

### 5. Build and ship once

```bash
npm run build
```

Then create **one** branch and **one** PR covering every year touched:

```bash
git checkout -b calendar/auto-update-YYYY-MM-DD
git add data/ config.json docs/ && git commit && git push -u origin HEAD
```

PR body should include, per year: the source PDF URL, its SHA-256 from the `.sha256` sidecar,
the event count, and the added/updated/removed summary. Recording the checksum is what makes
the next run's `unchanged` verdict auditable — a reviewer can tell exactly which upstream file
produced these dates.

Use the same review checklist as `/parse-calendar` step 9, and for a revision to an
already-published year add:

```
- [ ] Confirm removed events were genuinely removed upstream, not missed in parsing
- [ ] Note in the PR that subscribers may have the OLD dates already saved
```

### 6. Return the PR URL

Report the PR URL, the years included, and their event counts.

---

## Notes

- `make list-calendars` and `make fetch-calendars` wrap steps 1 and 2.
- The cache is disposable — `rm -rf .calendar-cache` forces a clean re-download, and every
  year will then report `new`.
- This skill never pushes to `main`. Calendar data reaches subscribers only through a
  reviewed PR, which is deliberate: a wrong date here means a parent sends a kid to a closed
  school.
