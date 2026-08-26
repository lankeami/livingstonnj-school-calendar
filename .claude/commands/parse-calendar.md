Parse a school calendar screenshot or PDF, update the data file for the given year, and open a PR.

**Arguments:** `YYYY-YYYY [/path/to/calendar.(png|pdf)]`

Examples:
- `/parse-calendar 2027-2028 ~/Desktop/calendar.png`
- `/parse-calendar 2027-2028 .calendar-cache/2027-2028_academic_calendar.pdf`

To fetch the district's PDFs automatically instead of supplying one, use `/fetch-calendars`.

---

## Steps

### 1. Validate arguments

Parse `$ARGUMENTS`:
- First token must match `YYYY-YYYY` where end year = start year + 1. If invalid, stop and tell the user.
- Second token (optional) is a path to an image or a PDF. If omitted, look for an image already in the current conversation, then for a cached PDF at `.calendar-cache/YYYY-YYYY_academic_calendar.pdf`. If none exists, ask the user to share the screenshot or run `/fetch-calendars`.

Read `config.json` to confirm the repo owner/name and current `activeYears`.

### 2. Read the calendar

**If the source is an image:** use the Read tool to open it (or reference the image already in the conversation).

**If the source is a PDF** (what the district publishes), read it two ways � they catch different errors:

```bash
pdftotext -layout path/to/calendar.pdf -
```

This renders every annotation as readable text (`1 - First Day for Students`,
`10-13 - Spring Recess, Schools Closed`) and is the reliable source for **event names and day
numbers**. Then also open the PDF with the Read tool, which handles PDFs natively, to confirm
the **visual grid** � shading, legend, and which month each annotation belongs to. These
calendars lay out two columns of months side by side, so the extracted text interleaves them;
column confusion is the most likely parsing error and the visual pass is what catches it.

If `pdftotext` is unavailable, use the Read tool alone and note that in your summary.

Then work through the calendar month by month — typically September through August for a school year, but follow whatever months appear in the image.

For each month, extract every annotated event. Pay close attention to:
- Colored/shaded cells and their legend
- Multi-day spans (e.g. "24-31 - Winter Recess")
- Asterisked notes (e.g. "3-5* Early Dismissal Elem")
- Footnotes at the bottom of the calendar
- **Bracketed entries are informational, not closures.** `[2-3 Rosh Hashanah]`, `[27 Eid]`,
  `[11-18 Passover, 16 Easter]` mark observances the district notes but does *not* close for.
  Include them only if the same date also carries a real closure annotation such as
  `District Closed` or `Schools Closed`.
- **`N Student Days` per-month totals are a cross-check.** If your parsed events imply a
  different count for a month, re-read that month before moving on.

### 3. Map events to JSON schema

Convert each event to the correct schema (from `src/types.ts`):

**Single-day:** `{ "title", "date": "YYYY-MM-DD", "type", "allDay": true, "description"? }`
**Multi-day:** `{ "title", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "type", "allDay": true, "description"? }`

All dates are **inclusive** — do NOT add the RFC 5545 +1 day offset here; the build script handles that.

Valid types: `holiday` | `no-school` | `early-dismissal` | `break` | `first-day` | `last-day` | `school`

Mapping guide:
| Calendar label | type |
|---|---|
| Federal/religious holidays (Labor Day, MLK, Eid, etc.) | `holiday` |
| NJEA Convention, Columbus Day (no students) | `no-school` |
| Professional Development Days (no students) | `no-school` |
| Thanksgiving / Winter / Spring / Feb Recess | `break` |
| Early Dismissal days | `early-dismissal` |
| Delayed Opening days | `school` + description "Delayed opening" |
| Partial days / semester change | `early-dismissal` + description |
| First day for students | `first-day` |
| Last day of school | `last-day` |

**Do not include** district-office-only closures (e.g. Friday office closures in July/August) that have no impact on students or parents.

### 4. Reconcile with existing data (if the year already exists)

Check if `data/YYYY-YYYY.json` already exists.

- If it **does not exist**: create it fresh, skip to step 5.
- If it **does exist**: upsert against the existing events array using the process below.

**Upsert logic — match key: normalized start date + event type**

The match key for each event is: `(startDate or date) + type`. Normalize titles before comparing (lowercase, strip punctuation) to avoid false misses on minor wording changes.

For each event parsed from the screenshot:
- **Match found in existing data** → update its `title`, `endDate` (if multi-day), and `description` in place. Keep any manually added fields that aren't in the screenshot.
- **No match found** → insert as a new event.

For each event in existing data with **no corresponding match in the screenshot**:
- **Remove it.** The screenshot is the authoritative source for what should exist; absence means the event was cancelled or the date changed (in which case it will appear as a new insertion at the new date).

Update `lastUpdated` to today's date.

### 5. Write preview file and wait for confirmation

Write the full parsed event list to `data/YYYY-YYYY.preview.json` (same structure as the real data file).

Then show the user a diff summary in chat:
```
  Added:   X events  (list titles + dates)
  Updated: Y events  (list titles + old → new dates)
  Removed: Z events  (list titles)
  Unchanged: N events
```
Flag any surprising removals (e.g. major holidays disappearing) explicitly.

Then say:
> **Please review `data/YYYY-YYYY.preview.json` and confirm the dates look correct. Reply "looks good" (or note any corrections) and I'll write the real data file and open a PR.**

**Do not proceed to step 6 until the user confirms.**

### 6. Write `data/YYYY-YYYY.json`

Once the user confirms, delete the preview file and write the real data file:

```json
{
  "schoolYear": "YYYY-YYYY",
  "lastUpdated": "YYYY-MM-DD",
  "events": [ ... sorted by start date ... ]
}
```

If the user provides corrections, apply them to the event list first, then write.

### 7. Update `config.json`

- Add the year to `activeYears` if not already present (append in chronological order).
- If this year comes after `currentYear` chronologically, update `currentYear` to this year and update `calendarName` to `"Livingston Schools YYYY-YYYY"`.
- Otherwise leave `currentYear` unchanged.

### 8. Run the build

Run `npm run build` and confirm it succeeds. If it fails, fix the issue before continuing.

### 9. Create a branch and PR

```bash
git checkout -b calendar/YYYY-YYYY
git add data/YYYY-YYYY.json config.json docs/
git commit -m "Add/update YYYY-YYYY school calendar (N events)"
git push -u origin calendar/YYYY-YYYY
```

Then create a PR with:
- **Title:** `Add YYYY-YYYY school calendar` (or `Update` if the file previously existed)
- **Body:**
  ```
  ## Summary
  - Source: [screenshot filename, or PDF URL + SHA-256 if fetched via /fetch-calendars]
  - N events across M months
  - [If updating:] X added, Y removed vs previous version

  ## Checklist
  - [ ] Verify first day and last day dates match the PDF
  - [ ] Verify recess dates (Winter, Spring, Thanksgiving)
  - [ ] Check for any asterisked footnotes that affect specific schools only
  - [ ] Run `npm run build` locally and confirm events render correctly on the landing page
  ```

Return the PR URL to the user when done.
