/**
 * Pure, `Date`-free rounding helper shared across the PSN data layer.
 *
 * Lives in its own module (split out of `util.ts`, which also carries the
 * `Date`-using `yearOf`) so it is safe to value-import from `*.effect.ts` files
 * without dragging a banned global into the strict `@effect/language-service`
 * glob. `util.ts` re-exports `round` so existing client callers are unchanged.
 */

/** Round `n` to `dp` decimal places (default whole number). */
export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
