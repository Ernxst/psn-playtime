import { queryOptions } from "@tanstack/react-query";
import type { DashboardData } from "@/lib/psn/types";
import { getDashboard, getRawgFranchises, getRawgGenres } from "@/server/psn";

/** Shared query for the dashboard payload. Demo data is returned when signed out. */
export const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"] as const,
  queryFn: () => getDashboard(),
});

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
    enabled: !data.isDemo && data.games.some((game) => game.genre === "Other"),
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
    enabled: !data.isDemo && data.games.some((game) => game.franchise === undefined),
    staleTime: Infinity,
  });
}
