#!/usr/bin/env bash
# Fetch per-school events from the district API and cache to data/school-events/<year>.json.
# Re-running is a no-op if the cache file already exists; delete it to force a refresh.
#
# Usage:
#   ./scripts/fetch-school-events.sh          # uses currentYear from config.json
#
# The API endpoint requires start_date and end_date (shorter `start`/`end` return HTTP 400).
# feed_ids[] is accepted but ignored by the server — filtering happens in fetch-school-events.ts.
# The public Google .ics URLs for individual feeds return HTTP 404; the JSON API is the only path.

set -euo pipefail
cd "$(dirname "$0")/.."

npm run fetch-school-events
