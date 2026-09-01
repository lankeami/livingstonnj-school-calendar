# Refresh School Events

Re-fetch school events from the district API and ship updates if data changed.

Steps:
1. Run `npm run refresh-school-events` to fetch latest data and rebuild
2. Run `git diff --stat` to check if any output files changed
3. If no changes: report "School events are up to date, no changes detected" and stop
4. If changes detected:
   a. Stage the changed files: `data/school-events/`, `docs/calendars/`, `docs/events.json`
   b. Commit with message: "Refresh school events from district API"
   c. Invoke `Skill("git-ship-pr")` to push and ship the PR
