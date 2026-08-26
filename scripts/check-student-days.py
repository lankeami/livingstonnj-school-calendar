#!/usr/bin/env python3
"""Cross-check parsed calendar events against the "N Student Days" totals printed on the PDF.

Every closure shifts its month's student-day count, so agreeing with all the printed
per-month totals confirms each closure date independently of how the annotation was read.
This is the strongest check available when the PDF cannot be rendered visually.

A school day is a weekday between the first and last day of school that no closure event
(holiday / no-school / break) covers. Early dismissals and delayed openings still count.

Usage:
  scripts/check-student-days.py DATA_FILE FIRST_DAY LAST_DAY MONTH=COUNT [MONTH=COUNT ...]

Example:
  scripts/check-student-days.py data/2027-2028.json 2027-09-01 2028-06-21 \\
      2027-09=21 2027-10=18 2027-11=18 2027-12=17 2028-01=19 \\
      2028-02=16 2028-03=23 2028-04=15 2028-05=22 2028-06=14

Read the MONTH=COUNT pairs off the calendar itself; each month block prints its own total.
Exits 0 if every month matches, 1 otherwise.
"""
import json
import sys
import datetime as dt

CLOSED_TYPES = {"holiday", "no-school", "break"}


def fail(msg):
    print(f"check-student-days: {msg}\n", file=sys.stderr)
    print(__doc__, file=sys.stderr)
    sys.exit(2)


def closure_dates(events):
    """Every date covered by a closure event, single-day or multi-day."""
    out = set()
    for e in events:
        if e.get("type") not in CLOSED_TYPES:
            continue
        if "date" in e:
            start = end = dt.date.fromisoformat(e["date"])
        else:
            start = dt.date.fromisoformat(e["startDate"])
            end = dt.date.fromisoformat(e["endDate"])
        d = start
        while d <= end:
            out.add(d)
            d += dt.timedelta(days=1)
    return out


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if len(argv) < 4:
        fail("need DATA_FILE, FIRST_DAY, LAST_DAY and at least one MONTH=COUNT pair")

    data_file, first_day, last_day = argv[0], argv[1], argv[2]

    expected = {}
    for pair in argv[3:]:
        if "=" not in pair:
            fail(f"expected MONTH=COUNT, got: {pair}")
        month, count = pair.split("=", 1)
        try:
            expected[month] = int(count)
        except ValueError:
            fail(f"count must be an integer, got: {pair}")

    try:
        events = json.load(open(data_file, encoding="utf-8"))["events"]
    except FileNotFoundError:
        fail(f"no such data file: {data_file}")
    except (KeyError, json.JSONDecodeError) as exc:
        fail(f"could not read events from {data_file}: {exc}")

    try:
        first = dt.date.fromisoformat(first_day)
        last = dt.date.fromisoformat(last_day)
    except ValueError as exc:
        fail(f"dates must be YYYY-MM-DD: {exc}")

    closed = closure_dates(events)

    actual = {}
    d = first
    while d <= last:
        if d.weekday() < 5 and d not in closed:
            key = f"{d.year}-{d.month:02d}"
            actual[key] = actual.get(key, 0) + 1
        d += dt.timedelta(days=1)

    fails = 0
    print(f"{'month':<10}{'printed':>9}{'computed':>10}   result")
    for month in sorted(expected):
        got = actual.get(month, 0)
        ok = got == expected[month]
        fails += 0 if ok else 1
        print(f"{month:<10}{expected[month]:>9}{got:>10}   {'OK' if ok else 'MISMATCH'}")

    total_printed = sum(expected.values())
    total_actual = sum(actual.get(m, 0) for m in expected)
    print(f"{'TOTAL':<10}{total_printed:>9}{total_actual:>10}   "
          f"{'OK' if total_printed == total_actual else 'MISMATCH'}")

    unexpected = sorted(set(actual) - set(expected))
    if unexpected:
        print(f"\nNote: school days found in months you gave no total for: "
              f"{', '.join(f'{m}={actual[m]}' for m in unexpected)}")

    print()
    if fails:
        print(f"FAIL: {fails} month(s) mismatch - re-read those months before continuing")
        return 1
    print("PASS: all months match the printed totals")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
