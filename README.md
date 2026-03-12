# Livingston Schools Calendar

A subscribable school calendar for the [Livingston, NJ School District](https://www.livingston.org). Subscribe once and get automatic updates — no re-subscribing each year.

## Subscribe

| App | Link |
|-----|------|
| Google Calendar | [Add to Google](https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Flankeami.github.io%2Flivingston-schools%2Fcalendars%2Flatest.ics) |
| Apple Calendar | `webcal://lankeami.github.io/livingstonnj-school-calendar/calendars/latest.ics` |
| Outlook | Subscribe via the [calendar page](https://lankeami.github.io/livingstonnj-school-calendar/) |
| Download | [latest.ics](https://lankeami.github.io/livingstonnj-school-calendar/calendars/latest.ics) |

> Replace `lankeami` with the actual GitHub username, or just visit the GitHub Pages site and use the subscribe buttons there.

## Development

```bash
npm install
npm run build      # generates docs/calendars/*.ics and docs/events.json
npm run typecheck  # type-check without building
```

## Updating Events

Edit `data/2026-2027.json` directly, then rebuild:

```bash
npm run build
git add -A && git commit -m "Update 2026-2027 events"
git push
```

GitHub Actions deploys automatically on push to `main`.

## New School Year

```bash
npm run new-year -- 2027-2028
# → creates data/2027-2028.json (NJ state holidays pre-filled)
# → updates config.json currentYear
```

Then fill in district-specific events from the [district PDF calendar](https://www.livingston.org), run `npm run build` to verify, and push.

## Event Format

`data/YYYY-YYYY.json` accepts single-day and multi-day events:

```json
{ "title": "First Day of School", "date": "2026-09-08", "type": "first-day", "allDay": true }
{ "title": "Winter Recess", "startDate": "2026-12-24", "endDate": "2027-01-01", "type": "break", "allDay": true }
```

Valid types: `holiday` · `no-school` · `early-dismissal` · `break` · `first-day` · `last-day` · `school`

## GitHub Pages Setup (one-time)

1. Create a public repo named `livingston-schools`
2. Update `repoOwner` in `config.json`
3. Go to **Settings → Pages → Source: GitHub Actions**
4. Push — the first deploy runs automatically
