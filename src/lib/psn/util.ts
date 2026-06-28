/**
 * Tiny pure helpers shared across the PSN data layer (server fetch + the
 * analytics/spend selectors). Kept here so rounding and year extraction have a
 * single definition rather than being copy-pasted per module.
 */

/** Round `n` to `dp` decimal places (default whole number). */
export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Year of an ISO/`YYYY-...` date, or `undefined` when unparseable. */
export function yearOf(date: string): number | undefined {
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(date);
  if (iso) return Number(iso[1]);
  const year = new Date(date).getUTCFullYear();
  return Number.isNaN(year) ? undefined : year;
}
