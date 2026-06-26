/**
 * Pure, chart-ready selectors over `DashboardData`.
 *
 * Nothing here touches the network or React — every function takes the already
 * fetched `DashboardData` and returns plain data the components render.
 *
 * Caveat: PSN only exposes *lifetime* totals per game, never per-year history.
 * Anything time-bucketed (see `hoursByYear`) uses a game's most-recent-play year
 * as a proxy and is labelled honestly in the UI as "by most-recent year".
 */
import type { DashboardData, GamePlay, Genre } from "./types";

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;

/** Year a game was most recently played (proxy bucket). */
function lastPlayedYear(game: GamePlay): number | undefined {
  if (!game.lastPlayed) return undefined;
  const year = new Date(game.lastPlayed).getUTCFullYear();
  return Number.isNaN(year) ? undefined : year;
}

export interface HeadlineTotals {
  totalHours: number;
  days: number;
  years: number;
  gamesPlayed: number;
  sessions: number;
  biggestGame?: GamePlay;
  trophyLevel: number;
}

export function headlineTotals(data: DashboardData): HeadlineTotals {
  const totalHours = data.meta.totalHours;
  return {
    totalHours,
    days: totalHours / HOURS_PER_DAY,
    years: totalHours / HOURS_PER_DAY / DAYS_PER_YEAR,
    gamesPlayed: data.meta.totalGames,
    sessions: data.meta.totalSessions,
    biggestGame: data.games[0],
    trophyLevel: data.profile.trophyLevel,
  };
}

export interface TopGame {
  name: string;
  hours: number;
  platform: GamePlay["platform"];
}

/** The n games with the most lifetime hours. */
export function topGamesByHours(data: DashboardData, n = 10): TopGame[] {
  return data.games
    .toSorted((a, b) => b.hours - a.hours)
    .slice(0, n)
    .map((g) => ({ name: g.name, hours: round(g.hours), platform: g.platform }));
}

export interface GenreSlice {
  genre: Genre;
  hours: number;
  games: number;
  share: number;
}

/** Lifetime hours grouped into coarse genre buckets, biggest first. */
export function genreBreakdown(data: DashboardData): GenreSlice[] {
  const byGenre = new Map<Genre, { hours: number; games: number }>();
  for (const g of data.games) {
    const cur = byGenre.get(g.genre) ?? { hours: 0, games: 0 };
    cur.hours += g.hours;
    cur.games += 1;
    byGenre.set(g.genre, cur);
  }
  const total = data.meta.totalHours || 1;
  return [...byGenre.entries()]
    .map(([genre, v]) => ({
      genre,
      hours: round(v.hours),
      games: v.games,
      share: round((v.hours / total) * 100, 1),
    }))
    .sort((a, b) => b.hours - a.hours);
}

export interface FranchiseTotal {
  franchise: string;
  hours: number;
  games: number;
}

/** Total hours per franchise/series, biggest first (games without one are skipped). */
export function topFranchises(data: DashboardData, n = 8): FranchiseTotal[] {
  const byFranchise = new Map<string, { hours: number; games: number }>();
  for (const g of data.games) {
    if (!g.franchise) continue;
    const cur = byFranchise.get(g.franchise) ?? { hours: 0, games: 0 };
    cur.hours += g.hours;
    cur.games += 1;
    byFranchise.set(g.franchise, cur);
  }
  return [...byFranchise.entries()]
    .map(([franchise, v]) => ({ franchise, hours: round(v.hours), games: v.games }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export interface YearBucket {
  year: number;
  hours: number;
  games: number;
}

/**
 * Hours bucketed by each game's most-recent-play year.
 *
 * This is a PROXY, not a true per-year timeline: PSN gives us only lifetime
 * totals, so a game's whole playtime lands in the year it was last touched.
 * The UI must label it "by most-recent year".
 */
export function hoursByYear(data: DashboardData): YearBucket[] {
  const byYear = new Map<number, { hours: number; games: number }>();
  for (const g of data.games) {
    const year = lastPlayedYear(g);
    if (year === undefined) continue;
    const cur = byYear.get(year) ?? { hours: 0, games: 0 };
    cur.hours += g.hours;
    cur.games += 1;
    byYear.set(year, cur);
  }
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, hours: round(v.hours), games: v.games }))
    .sort((a, b) => a.year - b.year);
}

export interface SessionPoint {
  name: string;
  hours: number;
  playCount: number;
  hoursPerSession: number;
}

/**
 * Average session length (hours ÷ play count) per game — separates the
 * "binge" titles (long sessions) from the "dip-in" ones (many short launches).
 */
export function bingeVsDipIn(data: DashboardData, n = 20): SessionPoint[] {
  return [...data.games]
    .filter((g) => g.playCount > 0 && g.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n)
    .map((g) => ({
      name: g.name,
      hours: round(g.hours),
      playCount: g.playCount,
      hoursPerSession: round(g.hours / g.playCount, 2),
    }));
}

export interface Lifespan {
  name: string;
  firstPlayed: string;
  lastPlayed: string;
  days: number;
  hours: number;
}

/** First→last play span (in days) for the top games by hours. */
export function lifespans(data: DashboardData, n = 10): Lifespan[] {
  return [...data.games]
    .filter((g) => g.firstPlayed && g.lastPlayed)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n)
    .map((g) => {
      const from = new Date(g.firstPlayed!).getTime();
      const to = new Date(g.lastPlayed!).getTime();
      const days = Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
      return {
        name: g.name,
        firstPlayed: g.firstPlayed!,
        lastPlayed: g.lastPlayed!,
        days,
        hours: round(g.hours),
      };
    });
}

export interface Recency {
  activeGames: number;
  dormantGames: number;
  activeHours: number;
  dormantHours: number;
  thisYear: number;
}

/** Split the library into titles touched this year vs. gone dormant. */
export function recency(data: DashboardData): Recency {
  const thisYear = new Date(data.fetchedAt).getUTCFullYear();
  let activeGames = 0;
  let dormantGames = 0;
  let activeHours = 0;
  let dormantHours = 0;
  for (const g of data.games) {
    if (lastPlayedYear(g) === thisYear) {
      activeGames += 1;
      activeHours += g.hours;
    } else {
      dormantGames += 1;
      dormantHours += g.hours;
    }
  }
  return {
    activeGames,
    dormantGames,
    activeHours: round(activeHours),
    dormantHours: round(dormantHours),
    thisYear,
  };
}

export interface ValuePerGame {
  avgHoursPerGame: number;
  avgSessionsPerGame: number;
  avgSessionLength: number;
}

/** Simple "how much do you get out of a game" averages. */
export function valuePerGame(data: DashboardData): ValuePerGame {
  const games = data.meta.totalGames || 1;
  const sessions = data.meta.totalSessions || 1;
  return {
    avgHoursPerGame: round(data.meta.totalHours / games, 1),
    avgSessionsPerGame: round(data.meta.totalSessions / games, 1),
    avgSessionLength: round(data.meta.totalHours / sessions, 2),
  };
}

export interface GameRow {
  titleId: string;
  name: string;
  platform: GamePlay["platform"];
  hours: number;
  playCount: number;
  lastPlayed?: string;
  trophyProgress?: number;
}

/** Flat, render-ready rows for the games table. */
export function gameRows(data: DashboardData): GameRow[] {
  return data.games.map((g) => ({
    titleId: g.titleId,
    name: g.name,
    platform: g.platform,
    hours: round(g.hours),
    playCount: g.playCount,
    lastPlayed: g.lastPlayed,
    trophyProgress: g.trophy?.progress,
  }));
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
