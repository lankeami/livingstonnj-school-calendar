/**
 * School-year resolution.
 *
 * A `YYYY-YYYY` school year begins on July 1 of its start year, so anything
 * from July onward belongs to the year that starts in the current calendar
 * year, and January–June belongs to the year that started the previous July.
 *
 * NOTE: this rule is implemented twice — here, and as `resolve_current_year`
 * in `scripts/fetch-calendars.sh`. The two must agree; change both together.
 */

/** Returns the `YYYY-YYYY` school year in session on `today` (a YYYY-MM-DD date). */
export function resolveCurrentSchoolYear(today: string): string {
  const match = today.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) {
    throw new Error(`Invalid date: "${today}". Expected YYYY-MM-DD.`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
