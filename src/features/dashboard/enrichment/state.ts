import type { RawgFranchiseItem, RawgGenreItem } from "@/server/api/enrichment.effect";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";

export const enrichmentStatuses = ["complete", "partial", "unavailable", "failed"] as const;

type EnrichmentStatus = (typeof enrichmentStatuses)[number];

/** Persisted RAWG outcome for each account-scoped representation. */
export interface DashboardEnrichmentState {
  /** The dashboard snapshot this outcome belongs to. */
  readonly fetchedAt: string;
  readonly genres: EnrichmentStatus;
  readonly franchises: EnrichmentStatus;
}

export type EnrichmentViewStatus = EnrichmentStatus | "pending";

/** One representation's live state, including the initial in-flight state. */
export interface EnrichmentViewState {
  readonly genres: EnrichmentViewStatus;
  readonly franchises: EnrichmentViewStatus;
}

function enrichGame(
  game: GamePlay,
  genreItem: RawgGenreItem | undefined,
  franchiseItem: RawgFranchiseItem | undefined
): GamePlay {
  return {
    ...game,
    ...(genreItem?.genre === undefined ? {} : { genre: genreItem.genre }),
    ...(genreItem?.typicalPlaytime === undefined
      ? {}
      : { typicalPlaytime: genreItem.typicalPlaytime }),
    ...(franchiseItem?.franchise === undefined ? {} : { franchise: franchiseItem.franchise }),
  };
}

/** Merge only metadata RAWG actually supplied, preserving PSN-owned fields. */
export function mergeRawgEnrichment(
  data: DashboardData,
  rawgGenres: ReadonlyArray<RawgGenreItem>,
  rawgFranchises: ReadonlyArray<RawgFranchiseItem>
): DashboardData {
  if (rawgGenres.length === 0 && rawgFranchises.length === 0) return data;
  const genresByTitleId = new Map(rawgGenres.map((item) => [item.titleId, item]));
  const franchisesByTitleId = new Map(rawgFranchises.map((item) => [item.titleId, item]));
  return {
    ...data,
    games: data.games.map((game) =>
      enrichGame(game, genresByTitleId.get(game.titleId), franchisesByTitleId.get(game.titleId))
    ),
  };
}

export function enrichmentComplete(state: DashboardEnrichmentState): boolean {
  return state.genres === "complete" && state.franchises === "complete";
}

/** Whether two account-scoped RAWG outcomes describe the same snapshot. */
export function sameEnrichmentState(
  left: DashboardEnrichmentState | null,
  right: DashboardEnrichmentState
): boolean {
  if (left === null) return false;
  return (
    left.fetchedAt === right.fetchedAt &&
    left.genres === right.genres &&
    left.franchises === right.franchises
  );
}
