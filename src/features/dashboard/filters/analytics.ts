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
import { computeTotals } from "@/domain/totals";
import { round, yearOf } from "@/features/dashboard/util";
import type { DashboardData, GamePlay, Genre, Platform } from "@/server/providers/account/snapshot";

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;

/** Year a game was most recently played (proxy bucket). */
function lastPlayedYear(game: GamePlay): number | undefined {
  return game.lastPlayed ? yearOf(game.lastPlayed) : undefined;
}

/**
 * Window to scope the dashboard to. PSN only gives lifetime hours per game, so
 * these windows filter by a game's *last-played* date, not hours-in-period.
 */
export type Timeframe = "all" | "last-12-months" | "last-2-years" | "this-year";

/**
 * App-wide caveat shown near the KPIs. PSN exposes only lifetime `playDuration`
 * per game, so there is no per-period playtime: a date filter selects *which*
 * games by their last-played date and still shows each game's lifetime hours.
 */
export const LIFETIME_HOURS_NOTE =
  "All playtime is PSN-recorded hours per game, which don't always reflect your true time played — PSN can under-report or miss play time for some titles, so a low number may understate it. PSN also doesn't report hours per period, so date filters select games by when you last played them and still show each game's recorded hours, not hours within the range.";

/** Short caveat for tooltips/titles on an individual hour figure. */
export const LIFETIME_HOURS_CAVEAT =
  "PSN-recorded hours, which don't always reflect your true time played: PSN can under-report or miss play time for some titles, so a low number may understate it, and it never reports hours within a period.";

/**
 * The actual current calendar year (UTC). The "this year" timeframe anchors to
 * this — real "now" — not to `data.fetchedAt`, which drifts when data is stale.
 */
export function currentYear(): number {
  return new Date().getUTCFullYear();
}

/** Inclusive lower bound (UTC) for a timeframe, relative to a reference date. */
function timeframeStart(reference: Date, range: Exclude<Timeframe, "all">): number {
  if (range === "this-year") {
    return Date.UTC(currentYear(), 0, 1);
  }
  const months = range === "last-12-months" ? 12 : 24;
  const start = new Date(reference);
  start.setUTCMonth(start.getUTCMonth() - months);
  return start.getTime();
}

/**
 * Return a NEW `DashboardData` scoped to games whose `lastPlayed` falls in the
 * selected window. Rolling windows measure back from `data.fetchedAt`; the
 * "this year" window anchors to the actual current calendar year. `meta` totals
 * are recomputed for the subset; `profile` is left untouched.
 *
 * Honest caveat: psn-api exposes lifetime hours only, so this windows by
 * *last-played activity*, not hours-played-in-period.
 */
export function filterByTimeframe(data: DashboardData, range: Timeframe): DashboardData {
  if (range === "all") return data;

  const from = timeframeStart(new Date(data.fetchedAt), range);
  return recompute(
    data,
    data.games.filter((g) => inWindow(g.lastPlayed, from))
  );
}

/**
 * Return a NEW `DashboardData` containing `games` with `meta` totals recomputed
 * for that subset. `profile` is left untouched.
 */
function recompute(data: DashboardData, games: GamePlay[]): DashboardData {
  const totals = computeTotals(games);
  return {
    ...data,
    games,
    meta: {
      ...data.meta,
      totalGames: totals.totalGames,
      totalHours: totals.totalHours,
      totalSessions: totals.totalSessions,
      firstEverPlayed: totals.firstEverPlayed,
      span: totals.span,
    },
  };
}

/** Activity bucket for a game relative to the data's most-recent activity year. */
export type Activity = "all" | "active" | "dormant";

/**
 * The page-level filter state. Defaults (see `defaultFilters`) are a no-op so
 * SSR output matches the first client render before the user touches anything.
 *
 * Date story: the `timeframe` preset and the explicit `lastPlayedFrom`/`To`
 * range are one coherent window — the preset is a quick-pick lower bound and the
 * custom range layers on top (the *later* lower bound and `lastPlayedTo` win).
 */
export interface DashboardFilters {
  timeframe: Timeframe;
  /** Case-insensitive substring match on the game name. */
  search: string;
  genres: Genre[];
  franchises: string[];
  platforms: Platform[];
  /** Inclusive `lastPlayed` lower bound, as a `yyyy-mm-dd` calendar day (UTC). */
  lastPlayedFrom?: string;
  /** Inclusive `lastPlayed` upper bound, as a `yyyy-mm-dd` calendar day (UTC). */
  lastPlayedTo?: string;
  minHours?: number;
  maxHours?: number;
  minSessions?: number;
  /** Keep only titles with a platinum trophy. */
  hasPlatinum: boolean;
  /** Keep only titles whose trophy `progress` is at least this percent. */
  minTrophyProgress?: number;
  activity: Activity;
}

export const defaultFilters: DashboardFilters = {
  timeframe: "all",
  search: "",
  genres: [],
  franchises: [],
  platforms: [],
  hasPlatinum: false,
  activity: "all",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Combined inclusive lower bound (ms) from the timeframe preset + custom from. */
function dateFloor(data: DashboardData, filters: DashboardFilters): number | undefined {
  const bounds: number[] = [];
  if (filters.timeframe !== "all") {
    bounds.push(timeframeStart(new Date(data.fetchedAt), filters.timeframe));
  }
  if (filters.lastPlayedFrom) {
    const t = Date.parse(filters.lastPlayedFrom);
    if (!Number.isNaN(t)) bounds.push(t);
  }
  return bounds.length === 0 ? undefined : Math.max(...bounds);
}

/** Inclusive upper bound (ms) covering the whole `lastPlayedTo` calendar day. */
function dateCeil(to: string | undefined): number | undefined {
  if (!to) return undefined;
  const t = Date.parse(to);
  return Number.isNaN(t) ? undefined : t + MS_PER_DAY - 1;
}

interface MatchContext {
  floor: number | undefined;
  ceil: number | undefined;
  search: string;
  mostRecentYear: number;
}

/**
 * A facet predicate: returns whether `g` survives this facet. Each facet is kept
 * tiny and tested only when its filter is active (see `activePredicates`), so the
 * overall match stays a flat `every` rather than one branchy mega-function.
 */
type Facet = (g: GamePlay, f: DashboardFilters, ctx: MatchContext) => boolean;

function matchSearch(g: GamePlay, _f: DashboardFilters, ctx: MatchContext): boolean {
  return g.name.toLowerCase().includes(ctx.search);
}

function matchGenre(g: GamePlay, f: DashboardFilters): boolean {
  return f.genres.includes(g.genre);
}

function matchFranchise(g: GamePlay, f: DashboardFilters): boolean {
  return g.franchise !== undefined && f.franchises.includes(g.franchise);
}

function matchPlatform(g: GamePlay, f: DashboardFilters): boolean {
  return f.platforms.includes(g.platform);
}

function matchFloor(g: GamePlay, _f: DashboardFilters, ctx: MatchContext): boolean {
  const t = playedAt(g);
  return t !== undefined && ctx.floor !== undefined && t >= ctx.floor;
}

function matchCeil(g: GamePlay, _f: DashboardFilters, ctx: MatchContext): boolean {
  const t = playedAt(g);
  return t !== undefined && ctx.ceil !== undefined && t <= ctx.ceil;
}

function matchMinHours(g: GamePlay, f: DashboardFilters): boolean {
  return f.minHours !== undefined && g.hours >= f.minHours;
}

function matchMaxHours(g: GamePlay, f: DashboardFilters): boolean {
  return f.maxHours !== undefined && g.hours <= f.maxHours;
}

function matchMinSessions(g: GamePlay, f: DashboardFilters): boolean {
  return f.minSessions !== undefined && g.playCount >= f.minSessions;
}

function matchPlatinum(g: GamePlay): boolean {
  return g.trophy?.hasPlatinum === true;
}

function matchTrophyProgress(g: GamePlay, f: DashboardFilters): boolean {
  return (
    f.minTrophyProgress !== undefined &&
    g.trophy !== undefined &&
    g.trophy.progress >= f.minTrophyProgress
  );
}

function matchActivity(g: GamePlay, f: DashboardFilters, ctx: MatchContext): boolean {
  const active = lastPlayedYear(g) === ctx.mostRecentYear;
  return f.activity === "active" ? active : !active;
}

/** Parsed `lastPlayed` epoch ms, or `undefined` when absent/unparseable. */
function playedAt(g: GamePlay): number | undefined {
  if (!g.lastPlayed) return undefined;
  const t = Date.parse(g.lastPlayed);
  return Number.isNaN(t) ? undefined : t;
}

/** The facet predicates whose filter is actually engaged in `filters`/`ctx`. */
function activePredicates(f: DashboardFilters, ctx: MatchContext): Facet[] {
  const preds: Facet[] = [];
  const add = (active: boolean, facet: Facet) => {
    if (active) preds.push(facet);
  };
  add(ctx.search !== "", matchSearch);
  add(f.genres.length > 0, matchGenre);
  add(f.franchises.length > 0, matchFranchise);
  add(f.platforms.length > 0, matchPlatform);
  add(ctx.floor !== undefined, matchFloor);
  add(ctx.ceil !== undefined, matchCeil);
  add(f.minHours !== undefined, matchMinHours);
  add(f.maxHours !== undefined, matchMaxHours);
  add(f.minSessions !== undefined, matchMinSessions);
  add(f.hasPlatinum, matchPlatinum);
  add(f.minTrophyProgress !== undefined, matchTrophyProgress);
  add(f.activity !== "all", matchActivity);
  return preds;
}

/**
 * Return a NEW `DashboardData` scoped to the games matching every active facet
 * in `filters`, with `meta` totals recomputed for the subset. `profile` is left
 * untouched. Timeframe preset + facets are applied together in a single pass, so
 * `meta` is recomputed exactly once.
 *
 * When no facet is active the original `data` is returned unchanged, keeping SSR
 * output identical to the first client render.
 */
export function applyFilters(data: DashboardData, filters: DashboardFilters): DashboardData {
  const ctx: MatchContext = {
    floor: dateFloor(data, filters),
    ceil: dateCeil(filters.lastPlayedTo),
    search: filters.search.trim().toLowerCase(),
    mostRecentYear: yearOf(data.fetchedAt) ?? currentYear(),
  };

  const preds = activePredicates(filters, ctx);
  if (preds.length === 0) return data;

  const games = data.games.filter((g) => preds.every((p) => p(g, filters, ctx)));
  if (games.length === data.games.length) return data;
  return recompute(data, games);
}

function inWindow(lastPlayed: string | undefined, from: number): boolean {
  if (!lastPlayed) return false;
  const t = new Date(lastPlayed).getTime();
  return !Number.isNaN(t) && t >= from;
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

export interface Comeback {
  name: string;
  firstPlayed: string;
  lastPlayed: string;
  sessions: number;
  /** Average days between sessions: span(first→last) ÷ (sessions − 1). */
  avgGapDays: number;
}

/**
 * "Kept coming back to" — games returned to after long breaks, ranked by the
 * average gap between sessions: `span(firstPlayed→lastPlayed) ÷ (sessions − 1)`.
 * A high value means few sessions spread over a long time.
 *
 * This is a PROXY, not real per-session gaps: PSN exposes only first/last play
 * dates and a session count, never per-session timestamps, so the gap is the
 * *mean* across the game's lifetime. Single-session and undated titles are
 * excluded (no span, and `sessions − 1 == 0` would divide by zero); so are
 * same-day spans (a 0-day average is not a comeback).
 */
/** A single game's comeback row, or `undefined` when it can't be a comeback. */
function toComeback(g: GamePlay): Comeback | undefined {
  if (!g.firstPlayed || !g.lastPlayed || g.playCount < 2) return undefined;
  const from = new Date(g.firstPlayed).getTime();
  const to = new Date(g.lastPlayed).getTime();
  const days = Math.max(0, Math.round((to - from) / MS_PER_DAY));
  const avgGapDays = round(days / (g.playCount - 1), 1);
  if (avgGapDays <= 0) return undefined;
  return {
    name: g.name,
    firstPlayed: g.firstPlayed,
    lastPlayed: g.lastPlayed,
    sessions: g.playCount,
    avgGapDays,
  };
}

export function comebacks(data: DashboardData, n = 10): Comeback[] {
  const out: Comeback[] = [];
  for (const g of data.games) {
    const c = toComeback(g);
    if (c) out.push(c);
  }
  return out.sort((a, b) => b.avgGapDays - a.avgGapDays).slice(0, n);
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
  const thisYear = yearOf(data.fetchedAt) ?? currentYear();
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
