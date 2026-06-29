/**
 * Shared, pure totals over a set of plays — the single definition the server
 * snapshot meta (`computeMeta`) and the client subset recompute (`recompute`)
 * both call, so the rounding and the earliest/latest derivation can never drift
 * between the two layers.
 *
 * Pure and `Date`-free on purpose: this lives in `@/domain` and is value-imported
 * by `*.effect.ts`, whose strict glob bans the `Date` global. Earliest/latest are
 * derived by lexicographic comparison of the ISO date strings already on each
 * play (valid because `YYYY-MM-DD` sorts chronologically), never by constructing
 * a `Date` from the ambient clock.
 */
import { round } from "./round";

/** The per-game fields the shared totals need; every `GamePlay` shape satisfies it. */
export interface TotalsInput {
  hours: number;
  playCount: number;
  firstPlayed?: string;
  lastPlayed?: string;
}

export interface Totals {
  totalGames: number;
  totalHours: number;
  totalSessions: number;
  /** ISO date of the earliest first-play across the games (also `span.from`). */
  firstEverPlayed: string | undefined;
  /** Overall activity span: earliest first-play → latest last-play. */
  span: { from: string | undefined; to: string | undefined };
}

/** Keep the lexicographically smaller ISO date, ignoring absent/empty candidates. */
function earlier(current: string | undefined, candidate: string | undefined): string | undefined {
  if (candidate === undefined || candidate.length === 0) return current;
  return current === undefined || candidate < current ? candidate : current;
}

/** Keep the lexicographically larger ISO date, ignoring absent/empty candidates. */
function later(current: string | undefined, candidate: string | undefined): string | undefined {
  if (candidate === undefined || candidate.length === 0) return current;
  return current === undefined || candidate > current ? candidate : current;
}

/** Aggregate library-wide totals for `games`, identical across server and client. */
export function computeTotals(games: ReadonlyArray<TotalsInput>): Totals {
  let totalHours = 0;
  let totalSessions = 0;
  let firstEverPlayed: string | undefined;
  let lastEverPlayed: string | undefined;
  for (const g of games) {
    totalHours += g.hours;
    totalSessions += g.playCount;
    firstEverPlayed = earlier(firstEverPlayed, g.firstPlayed);
    lastEverPlayed = later(lastEverPlayed, g.lastPlayed);
  }
  return {
    totalGames: games.length,
    totalHours: round(totalHours, 2),
    totalSessions,
    firstEverPlayed,
    span: { from: firstEverPlayed, to: lastEverPlayed },
  };
}
