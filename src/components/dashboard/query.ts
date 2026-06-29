import { queryOptions, type QueryStatus } from "@tanstack/react-query";
import type { DashboardData } from "@/lib/psn/contract.schema";
import { getRawgFranchises, getRawgGenres } from "@/server/handlers.effect";

/** Whether any game still lacks a recognised genre and needs a RAWG lookup. */
function needsGenreLookup(data: DashboardData): boolean {
  return data.games.some((game) => game.genre === "Other");
}

/** Whether any game still lacks a franchise and needs a RAWG lookup. */
function needsFranchiseLookup(data: DashboardData): boolean {
  return data.games.some((game) => game.franchise === undefined);
}

/**
 * A lookup is "done" when it was not needed (nothing to look up) or has actually
 * succeeded. An errored lookup (`status === "error"`) is NOT done, so its data
 * stays un-enriched and a later visit retries.
 */
function lookupDone(needed: boolean, status: QueryStatus): boolean {
  return !needed || status === "success";
}

/**
 * Whether the merged RAWG enrichment may be persisted as `enriched: true`.
 *
 * Gates on the query `status` (not `fetchStatus`, which is also `"idle"` in the
 * error state) so a transient RAWG failure is no longer cached as enriched
 * permanently — fixing #136.
 */
export function shouldPersistEnrichment(
  data: DashboardData,
  genresStatus: QueryStatus,
  franchisesStatus: QueryStatus
): boolean {
  if (data.isDemo || data.enriched) return false;
  return (
    lookupDone(needsGenreLookup(data), genresStatus) &&
    lookupDone(needsFranchiseLookup(data), franchisesStatus)
  );
}

export function rawgGenresQueryOptions(data: DashboardData) {
  return queryOptions({
    queryKey: ["dashboard", "rawg-genres", data.fetchedAt] as const,
    queryFn: () =>
      getRawgGenres({
        data: {
          titles: data.games.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      }),
    enabled: !data.isDemo && !data.enriched && needsGenreLookup(data),
    staleTime: Infinity,
  });
}

export function rawgFranchisesQueryOptions(data: DashboardData) {
  return queryOptions({
    queryKey: ["dashboard", "rawg-franchises", data.fetchedAt] as const,
    queryFn: () =>
      getRawgFranchises({
        data: {
          titles: data.games.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      }),
    enabled: !data.isDemo && !data.enriched && needsFranchiseLookup(data),
    staleTime: Infinity,
  });
}
