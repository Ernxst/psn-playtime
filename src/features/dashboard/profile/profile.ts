import {
  genreBreakdown,
  type GenreSlice,
  topFranchises,
} from "@/features/dashboard/filters/analytics";
import { fmtHours, fmtNumber } from "@/features/dashboard/format";
import { round } from "@/features/dashboard/util";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RecordedSpan {
  game: GamePlay;
  days: number;
}

export interface PlayProfile {
  centre: string;
  span?: string;
  trophies?: string;
  trophyNotice?: string;
  copy: string;
}

function percentage(part: number, total: number): string {
  const value = total > 0 ? round((part / total) * 100, 1) : 0;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function games(count: number): string {
  return `${fmtNumber(count)} ${count === 1 ? "game" : "games"}`;
}

function launches(count: number): string {
  return `${fmtNumber(count)} ${count === 1 ? "launch" : "launches"}`;
}

function lists(count: number): string {
  return `${fmtNumber(count)} matched ${count === 1 ? "list" : "lists"}`;
}

function topGame(data: DashboardData): GamePlay | undefined {
  return data.games.toSorted((a, b) => b.hours - a.hours)[0];
}

function gameSentence(data: DashboardData, game: GamePlay): string {
  return `${game.name} is your top game with ${fmtHours(game.hours)} recorded (${percentage(game.hours, data.meta.totalHours)} of this library).`;
}

function franchiseSentence(data: DashboardData): string {
  const franchise = topFranchises(data, 1)[0];
  if (!franchise) return "";
  return ` ${franchise.franchise} is your leading franchise with ${fmtHours(franchise.hours)} recorded across ${games(franchise.games)}.`;
}

function enrichedCentre(data: DashboardData, genre: GenreSlice, game: GamePlay): string {
  return `Your centre of gravity is ${genre.genre}: ${fmtHours(genre.hours)} recorded across ${games(genre.games)} (${genre.share.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of this library).${franchiseSentence(data)} ${gameSentence(data, game)}`;
}

function enrichmentComplete(data: DashboardData): boolean {
  return data.isDemo || data.enriched === true;
}

function centreOfGravity(data: DashboardData): string {
  const game = topGame(data);
  if (!game) return "There is no recorded game play to summarise.";
  const genre = genreBreakdown(data)[0];
  if (!enrichmentComplete(data)) return gameSentence(data, game);
  if (!genre) return gameSentence(data, game);
  if (genre.genre === "Other") return gameSentence(data, game);
  return enrichedCentre(data, genre, game);
}

function recordedSpan(game: GamePlay): RecordedSpan | undefined {
  if (game.playCount < 2) return undefined;
  if (!game.firstPlayed) return undefined;
  if (!game.lastPlayed) return undefined;
  const first = Date.parse(game.firstPlayed);
  const last = Date.parse(game.lastPlayed);
  if ([first, last].some(Number.isNaN)) return undefined;
  return { game, days: Math.max(0, Math.round((last - first) / MS_PER_DAY)) };
}

export function longestRecordedSpan(data: DashboardData): RecordedSpan | undefined {
  return data.games
    .map(recordedSpan)
    .filter((span) => span !== undefined)
    .toSorted((a, b) => b.days - a.days)[0];
}

function spanDuration(days: number): string {
  if (days < 365) return `${fmtNumber(days)} ${days === 1 ? "day" : "days"}`;
  const years = round(days / 365, 1);
  return `${years.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${years === 1 ? "year" : "years"}`;
}

function spanSentence(data: DashboardData): string | undefined {
  const span = longestRecordedSpan(data);
  if (!span) return undefined;
  return `${span.game.name} has your longest recorded span: ${spanDuration(span.days)} from first to latest recorded play, with ${fmtHours(span.game.hours)} recorded across ${launches(span.game.playCount)}.`;
}

function trophySentence(data: DashboardData): string | undefined {
  if (data.trophiesUnavailable) return undefined;
  const matched = data.games.filter((game) => game.trophy !== undefined);
  const completed = matched.filter((game) => (game.trophy?.progress ?? 0) >= 100).length;
  const platinums = matched.filter((game) => (game.trophy?.earned.platinum ?? 0) > 0).length;
  const coverage = percentage(matched.length, data.games.length);
  return `Your matched trophy data covers ${fmtNumber(matched.length)} of ${games(data.games.length)} (${coverage}). You have completed ${fmtNumber(completed)} of those ${lists(matched.length)} and earned ${fmtNumber(platinums)} ${platinums === 1 ? "platinum" : "platinums"}.`;
}

export function playProfile(data: DashboardData): PlayProfile {
  const centre = centreOfGravity(data);
  const span = spanSentence(data);
  const trophies = trophySentence(data);
  const copy = [centre, span, trophies].filter((sentence) => sentence !== undefined).join("\n\n");
  return {
    centre,
    span,
    trophies,
    trophyNotice: data.trophiesUnavailable
      ? "Trophy data was unavailable, so it is not included in this profile."
      : undefined,
    copy,
  };
}
