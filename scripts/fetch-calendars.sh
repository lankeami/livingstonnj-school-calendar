#!/usr/bin/env bash
#
# Discover and download Livingston Public Schools academic calendar PDFs.
#
# The district publishes one PDF per school year on a single page. This script
# finds them, works out which years are "current" and "next", and downloads
# those into a local cache, reporting whether each one actually changed since
# the last run. /fetch-calendars drives it; see .claude/commands/fetch-calendars.md.
#
set -euo pipefail

DEFAULT_PAGE_URL="https://www.livingston.org/111388"

PAGE_URL="$DEFAULT_PAGE_URL"
CACHE_DIR=""
MODE=""
TODAY=""
WANT_ALL=false

usage() {
  cat <<'USAGE'
Usage: fetch-calendars.sh (--list | --fetch) [options]

Modes:
  --list              Print every academic calendar PDF found, one per line, as
                      YYYY-YYYY<TAB>URL<TAB>label   (label: current | next | -)
  --fetch             Download the current and next school year PDFs into the
                      cache, printing YYYY-YYYY<TAB>status<TAB>path
                      (status: new | changed | unchanged | not-published)

Options:
  --today YYYY-MM-DD  Treat this as today's date when resolving the school year.
                      Defaults to the real current date.
  --all               With --fetch, download every discovered year, not just
                      current and next.
  --page-url URL      Override the district page to scrape.
  --cache-dir DIR     Override the cache directory (default: <repo>/.calendar-cache).
  -h, --help          Show this help.

A school year YYYY-YYYY is treated as starting on July 1 of YYYY, so any date
from 2026-07-01 through 2027-06-30 resolves to current=2026-2027, next=2027-2028.
USAGE
}

die() {
  echo "fetch-calendars: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' not found.$2"
}

# ---------------------------------------------------------------------------
# School year resolution
# ---------------------------------------------------------------------------

# A school year runs July -> June. July or later means the year that starts
# this calendar year; earlier means the year that started last calendar year.
resolve_current_year() {
  local today="$1" y m
  y="${today%%-*}"
  m="${today:5:2}"
  # 10# forces base-10 so a leading zero ("08") is not read as octal.
  if (( 10#$m >= 7 )); then
    echo "${y}-$((y + 1))"
  else
    echo "$((y - 1))-${y}"
  fi
}

next_year_after() {
  local start="${1%%-*}"
  echo "$((start + 1))-$((start + 2))"
}

# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

# Emits "YYYY-YYYY<TAB>URL" for each academic calendar PDF linked on the page.
#
# The filename is the only reliable key: link text is inconsistent ("2025 2026
# Academic Calendar" with spaces vs. "2025-2026_..." with a hyphen), and the
# same page also links unrelated PDFs such as reporting_dates_*.pdf, which the
# _academic_calendar suffix filters out.
discover() {
  local html
  html=$(curl -sSL --fail --max-time 60 -A "Mozilla/5.0 (fetch-calendars)" "$PAGE_URL" 2>&1) \
    || die "could not fetch district page: $PAGE_URL"

  [[ -n "$html" ]] || die "district page returned an empty response: $PAGE_URL"

  local rows
  rows=$(printf '%s' "$html" \
    | grep -oiE 'https?://[^"'"'"' <>]*[0-9]{4}-[0-9]{4}_academic_calendar\.pdf' \
    | sort -u \
    | while IFS= read -r url; do
        local base year
        base="${url##*/}"
        year="${base%%_academic_calendar.pdf}"
        [[ "$year" =~ ^[0-9]{4}-[0-9]{4}$ ]] && printf '%s\t%s\n' "$year" "$url"
      done \
    | sort)

  if [[ -z "$rows" ]]; then
    die "no academic calendar PDFs found on $PAGE_URL.
The page markup may have changed, or the page may now require JavaScript.
Diagnose with:  curl -sL '$PAGE_URL' | grep -oiE 'href=\"[^\"]*\\.pdf\"'
Expected links shaped like:
  https://files.smartsites.parentsquare.com/11806/YYYY-YYYY_academic_calendar.pdf"
  fi

  printf '%s\n' "$rows"
}

# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

# Downloads one year's PDF and reports new / changed / unchanged.
#
# The download lands in a temp file and is only promoted into the cache once it
# has been verified to be a real PDF, so a failed or truncated transfer can
# never leave a partial file behind for the parser to choke on. When the hash
# matches, the cached file is left completely untouched.
fetch_one() {
  local year="$1" url="$2" dest="$CACHE_DIR/${year}_academic_calendar.pdf"
  local tmp status new_sum old_sum=""

  tmp=$(mktemp "${TMPDIR:-/tmp}/fetch-calendars.XXXXXX")
  # shellcheck disable=SC2064  # expand $tmp now, not at trap time
  trap "rm -f '$tmp'" RETURN

  curl -sSL --fail --max-time 120 -A "Mozilla/5.0 (fetch-calendars)" "$url" -o "$tmp" 2>/dev/null \
    || die "download failed for $year: $url"

  [[ -s "$tmp" ]] || die "download for $year was empty: $url"
  # Guards against a captive portal or error page served with a 200.
  [[ "$(head -c 5 "$tmp")" == "%PDF-" ]] \
    || die "download for $year is not a PDF (got $(head -c 64 "$tmp" | tr -d '\0' | head -1)): $url"

  new_sum=$(sha256sum "$tmp" | cut -d' ' -f1)
  [[ -f "$dest" ]] && old_sum=$(sha256sum "$dest" | cut -d' ' -f1)

  if [[ -z "$old_sum" ]]; then
    status="new"
  elif [[ "$old_sum" == "$new_sum" ]]; then
    status="unchanged"
  else
    status="changed"
  fi

  if [[ "$status" != "unchanged" ]]; then
    mv "$tmp" "$dest"
    printf '%s  %s\n' "$new_sum" "${dest##*/}" > "${dest}.sha256"
  fi

  printf '%s\t%s\t%s\n' "$year" "$status" "$dest"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)       MODE="list"; shift ;;
    --fetch)      MODE="fetch"; shift ;;
    --all)        WANT_ALL=true; shift ;;
    --today)      TODAY="${2:-}"; [[ -n "$TODAY" ]] || die "--today needs a YYYY-MM-DD value"; shift 2 ;;
    --page-url)   PAGE_URL="${2:-}"; [[ -n "$PAGE_URL" ]] || die "--page-url needs a value"; shift 2 ;;
    --cache-dir)  CACHE_DIR="${2:-}"; [[ -n "$CACHE_DIR" ]] || die "--cache-dir needs a value"; shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *)            usage >&2; die "unknown argument: $1" ;;
  esac
done

[[ -n "$MODE" ]] || { usage >&2; die "specify --list or --fetch"; }

require_cmd curl ""
require_cmd sha256sum ""

TODAY="${TODAY:-$(date +%F)}"
[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--today must be YYYY-MM-DD, got: $TODAY"

if [[ -z "$CACHE_DIR" ]]; then
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  CACHE_DIR="$repo_root/.calendar-cache"
fi

CURRENT_YEAR=$(resolve_current_year "$TODAY")
NEXT_YEAR=$(next_year_after "$CURRENT_YEAR")

DISCOVERED=$(discover)

if [[ "$MODE" == "list" ]]; then
  while IFS=$'\t' read -r year url; do
    label="-"
    [[ "$year" == "$CURRENT_YEAR" ]] && label="current"
    [[ "$year" == "$NEXT_YEAR" ]] && label="next"
    printf '%s\t%s\t%s\n' "$year" "$url" "$label"
  done <<< "$DISCOVERED"
  exit 0
fi

# --fetch
mkdir -p "$CACHE_DIR"

if $WANT_ALL; then
  WANTED=$(printf '%s\n' "$DISCOVERED" | cut -f1)
else
  WANTED=$(printf '%s\n%s\n' "$CURRENT_YEAR" "$NEXT_YEAR")
fi

while IFS= read -r year; do
  [[ -n "$year" ]] || continue
  url=$(printf '%s\n' "$DISCOVERED" | awk -F'\t' -v y="$year" '$1 == y {print $2; exit}')
  if [[ -z "$url" ]]; then
    # Normal for most of the year: the district posts next year's calendar
    # only once the board approves it. Not an error.
    printf '%s\t%s\t%s\n' "$year" "not-published" "-"
    continue
  fi
  fetch_one "$year" "$url"
done <<< "$WANTED"
