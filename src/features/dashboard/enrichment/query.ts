import { queryOptions, type QueryStatus } from "@tanstack/react-query";
import {
  getRawgFranchises,
  getRawgGenres,
  type RawgEnrichmentOutcome,
} from "@/server/api/enrichment.effect";
import type { DashboardData } from "@/server/providers/account/snapshot";
import type { DashboardEnrichmentState, EnrichmentViewState, EnrichmentViewStatus } from "./state";

/** Whether any game still lacks a recognised genre and needs a RAWG lookup. */
function needsGenreLookup(data: DashboardData): boolean {
  return data.games.some((game) => game.genre === "Other");
}

/** Whether any game still lacks a franchise and needs a RAWG lookup. */
function needsFranchiseLookup(data: DashboardData): boolean {
  return data.games.some((game) => game.franchise === undefined);
}

/** Ignore an account's cached outcome when it belongs to an older PSN snapshot. */
export function enrichmentForSnapshot(
  data: DashboardData,
  persisted: DashboardEnrichmentState | null
): DashboardEnrichmentState | null {
  return persisted?.fetchedAt === data.fetchedAt ? persisted : null;
}

function genreTitles(data: DashboardData) {
  return data.games.filter((game) => game.genre === "Other");
}

function franchiseTitles(data: DashboardData) {
  return data.games.filter((game) => game.franchise === undefined);
}

function lookupStatus(
  needed: boolean,
  persisted: EnrichmentViewStatus | undefined,
  status: QueryStatus,
  outcome: RawgEnrichmentOutcome | undefined
): EnrichmentViewStatus {
  if (!needed) return "complete";
  if (persisted === "complete") return "complete";
  if (status === "error") return "failed";
  return outcome ?? persistedOrPending(persisted);
}

function persistedOrPending(persisted: EnrichmentViewStatus | undefined): EnrichmentViewStatus {
  return persisted ?? "pending";
}

interface EnrichmentQueryState {
  readonly genres: {
    readonly status: QueryStatus;
    readonly outcome: RawgEnrichmentOutcome | undefined;
  };
  readonly franchises: {
    readonly status: QueryStatus;
    readonly outcome: RawgEnrichmentOutcome | undefined;
  };
}

/** Resolve one account's live query state against its last persisted outcome. */
export function enrichmentViewState(
  data: DashboardData,
  persisted: DashboardEnrichmentState | null,
  queries: EnrichmentQueryState
): EnrichmentViewState {
  if (data.isDemo) return { genres: "complete", franchises: "complete" };
  return {
    genres: lookupStatus(
      needsGenreLookup(data),
      persisted?.genres,
      queries.genres.status,
      queries.genres.outcome
    ),
    franchises: lookupStatus(
      needsFranchiseLookup(data),
      persisted?.franchises,
      queries.franchises.status,
      queries.franchises.outcome
    ),
  };
}

/** Persist only settled outcomes; pending work retains the previous cache state. */
export function settledEnrichmentState(
  fetchedAt: string,
  state: EnrichmentViewState
): DashboardEnrichmentState | null {
  const { genres, franchises } = state;
  if (genres === "pending" || franchises === "pending") return null;
  return { fetchedAt, genres, franchises };
}

export function rawgGenresQueryOptions(
  data: DashboardData,
  persisted: DashboardEnrichmentState | null = null
) {
  const titles = genreTitles(data);
  return queryOptions({
    queryKey: [
      "dashboard",
      data.profile.accountId,
      "rawg-genres",
      data.fetchedAt,
      titles.map((title) => title.titleId),
    ] as const,
    queryFn: () =>
      getRawgGenres({
        data: {
          titles: titles.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      }),
    enabled: !data.isDemo && persisted?.genres !== "complete" && titles.length > 0,
    staleTime: Infinity,
  });
}

export function rawgFranchisesQueryOptions(
  data: DashboardData,
  persisted: DashboardEnrichmentState | null = null
) {
  const titles = franchiseTitles(data);
  return queryOptions({
    queryKey: [
      "dashboard",
      data.profile.accountId,
      "rawg-franchises",
      data.fetchedAt,
      titles.map((title) => title.titleId),
    ] as const,
    queryFn: () =>
      getRawgFranchises({
        data: {
          titles: titles.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      }),
    enabled: !data.isDemo && persisted?.franchises !== "complete" && titles.length > 0,
    staleTime: Infinity,
  });
}
