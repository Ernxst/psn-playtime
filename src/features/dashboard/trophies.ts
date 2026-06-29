/**
 * Pure trophy selectors over `DashboardData`. Nothing here touches the network
 * or React — it takes the already-fetched data and returns plain, chart-ready
 * aggregates.
 *
 * Scoping rule (critical): account totals (`trophyLevel`, `levelProgress`,
 * earned P/G/S/B, `totalTrophies`) come straight from `profile`. Everything
 * per-game is scoped to titles that actually matched a PSN trophy list
 * (`game.trophy` present). Games with no matched list are UNKNOWN, never 0% —
 * they are excluded from every per-game count, average and percentage, and the
 * matched denominator (`matchedGames` of `totalGames`) is reported so the UI can
 * say exactly what the numbers are based on.
 *
 * Caveat: we collect no per-trophy names or rarity, so nothing here ranks or
 * implies rarity. `progress` is per trophy list; stacked PS4/PS5 lists collapse
 * to the more-progressed set upstream.
 */
import type {
  DashboardData,
  GamePlay,
  GameTrophy,
  TrophyCounts,
} from "@/server/providers/account/snapshot";
import { round } from "./util";

/** Completion at or above which a plat-capable game counts as "within reach". */
const REACH_THRESHOLD = 80;

/** One matched game, flattened with its trophy progress for the UI. */
export interface TrophyGame {
  titleId: string;
  name: string;
  imageUrl?: string;
  /** 0–100 completion of the matched trophy list. */
  progress: number;
  earned: TrophyCounts;
  hasPlatinum: boolean;
  lastEarnedAt?: string;
}

/** A completion-spectrum bucket scoped to matched games. */
interface CompletionBucket {
  label: string;
  count: number;
}

/** One earned trophy type for the distribution chart. */
interface TrophyTypeCount {
  type: "Platinum" | "Gold" | "Silver" | "Bronze";
  count: number;
}

export interface TrophySummary {
  /** PSN account trophy level. */
  trophyLevel: number;
  /** Percent toward the next level (0–100). */
  levelProgress: number;
  /** Sum of every earned trophy on the account. */
  totalTrophies: number;
  /** Account-wide earned P/G/S/B counts. */
  earned: TrophyCounts;
  /** Earned P/G/S/B as chart rows, in descending tier order. */
  distribution: TrophyTypeCount[];
  /** Every game in the library — the universe the matched denominator sits in. */
  totalGames: number;
  /** Games with a matched trophy list — the denominator for every per-game stat. */
  matchedGames: number;
  /** Average completion across matched games (0–100); 0 when none matched. */
  avgCompletion: number;
  /** Matched games at 100% completion. */
  completedGames: number;
  /** Games where a platinum was earned, most-recent platinum first. */
  platinums: TrophyGame[];
  /** Plat-capable games ≥80% done but not yet platted, closest to the plat first. */
  withinReach: TrophyGame[];
  /** Matched games bucketed by completion. */
  completionBuckets: CompletionBucket[];
  /** Matched games with trophy activity, most recently earned first. */
  recent: TrophyGame[];
}

function toTrophyGame(game: GamePlay, trophy: GameTrophy): TrophyGame {
  return {
    titleId: game.titleId,
    name: game.name,
    imageUrl: game.imageUrl,
    progress: trophy.progress,
    earned: trophy.earned,
    hasPlatinum: trophy.hasPlatinum,
    lastEarnedAt: trophy.lastEarnedAt,
  };
}

/** The matched games: those carrying a PSN trophy list. */
function matchedGames(data: DashboardData): TrophyGame[] {
  const out: TrophyGame[] = [];
  for (const game of data.games) {
    if (game.trophy) out.push(toTrophyGame(game, game.trophy));
  }
  return out;
}

/** Most-recently-earned first; games with no `lastEarnedAt` sort last. */
function byRecent(a: TrophyGame, b: TrophyGame): number {
  return (b.lastEarnedAt ?? "").localeCompare(a.lastEarnedAt ?? "");
}

function byProgressDesc(a: TrophyGame, b: TrophyGame): number {
  return b.progress - a.progress;
}

const isCompleted = (game: TrophyGame): boolean => game.progress >= 100;
const isPlatted = (game: TrophyGame): boolean => game.earned.platinum > 0;
const hasActivity = (game: TrophyGame): boolean => Boolean(game.lastEarnedAt);
const isWithinReach = (game: TrophyGame): boolean =>
  game.hasPlatinum && game.earned.platinum === 0 && game.progress >= REACH_THRESHOLD;

/** Mean completion across the given games, rounded; 0 when empty. */
function meanProgress(games: TrophyGame[]): number {
  if (games.length === 0) return 0;
  let total = 0;
  for (const game of games) total += game.progress;
  return round(total / games.length);
}

function bucketise(games: TrophyGame[]): CompletionBucket[] {
  const counts = { completed: 0, high: 0, mid: 0, low: 0 };
  for (const game of games) {
    if (game.progress >= 100) counts.completed += 1;
    else if (game.progress >= REACH_THRESHOLD) counts.high += 1;
    else if (game.progress >= 40) counts.mid += 1;
    else counts.low += 1;
  }
  return [
    { label: "Completed (100%)", count: counts.completed },
    { label: "Almost there (80–99%)", count: counts.high },
    { label: "Halfway (40–79%)", count: counts.mid },
    { label: "Just started (<40%)", count: counts.low },
  ];
}

/**
 * Build the trophy section's view model. Per-game collections are scoped to
 * matched games only; `matchedGames` / `totalGames` let the UI state the
 * denominator honestly.
 */
export function summariseTrophies(data: DashboardData): TrophySummary {
  const { profile } = data;
  const games = matchedGames(data);

  return {
    trophyLevel: profile.trophyLevel,
    levelProgress: profile.levelProgress,
    totalTrophies: profile.totalTrophies,
    earned: profile.earned,
    distribution: [
      { type: "Platinum", count: profile.earned.platinum },
      { type: "Gold", count: profile.earned.gold },
      { type: "Silver", count: profile.earned.silver },
      { type: "Bronze", count: profile.earned.bronze },
    ],
    totalGames: data.games.length,
    matchedGames: games.length,
    avgCompletion: meanProgress(games),
    completedGames: games.filter(isCompleted).length,
    platinums: games.filter(isPlatted).toSorted(byRecent),
    withinReach: games.filter(isWithinReach).toSorted(byProgressDesc),
    completionBuckets: bucketise(games),
    recent: games.filter(hasActivity).toSorted(byRecent),
  };
}
