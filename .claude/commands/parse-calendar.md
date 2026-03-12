Parse a school calendar screenshot, update the data file for the given year, and open a PR.

**Arguments:** `YYYY-YYYY [/path/to/screenshot.png]`

Example: `/parse-calendar 2027-2028 ~/Desktop/calendar.png`

---

## Steps

### 1. Validate arguments

Parse `$ARGUMENTS`:
- First token must match `YYYY-YYYY` where end year = start year + 1. If invalid, stop and tell the user.
- Second token (optional) is an image path. If omitted, look for an image already in the current conversation. If neither exists, ask the user to share the screenshot.

Read `config.json` to confirm the repo owner/name and current `activeYears`.

### 2. Read the calendar image

Use the Read tool to open the image file (or reference the image already in the conversation). Work through the calendar month by month — typically September through August for a school year, but follow whatever months appear in the image.

For each month, extract every annotated event. Pay close attention to:
- Colored/shaded cells and their legend
- Multi-day spans (e.g. "24-31 - Winter Recess")
- Asterisked notes (e.g. "3-5* Early Dismissal Elem")
- Footnotes at the bottom of the calendar

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

Show the user a brief diff summary before writing:
```
  Added:   X events  (list titles)
  Updated: Y events  (list titles where anything changed)
  Removed: Z events  (list titles)
  Unchanged: N events
```
If any removals look surprising (e.g. a major holiday disappearing), flag them explicitly and ask the user to confirm before proceeding.

### 5. Write `data/YYYY-YYYY.json`

Write the file with this structure:
```json
{
  "schoolYear": "YYYY-YYYY",
  "lastUpdated": "YYYY-MM-DD",
  "events": [ ... sorted by start date ... ]
}
```

### 6. Update `config.json`

- Add the year to `activeYears` if not already present (append in chronological order).
- If this year comes after `currentYear` chronologically, update `currentYear` to this year and update `calendarName` to `"Livingston Schools YYYY-YYYY"`.
- Otherwise leave `currentYear` unchanged.

### 7. Run the build

Run `npm run build` and confirm it succeeds. If it fails, fix the issue before continuing.

### 8. Create a branch and PR

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
  - Source: [screenshot filename or PDF link if known]
  - N events across M months
  - [If updating:] X added, Y removed vs previous version

  ## Checklist
  - [ ] Verify first day and last day dates match the PDF
  - [ ] Verify recess dates (Winter, Spring, Thanksgiving)
  - [ ] Check for any asterisked footnotes that affect specific schools only
  - [ ] Run `npm run build` locally and confirm events render correctly on the landing page
  ```

Return the PR URL to the user when done.
