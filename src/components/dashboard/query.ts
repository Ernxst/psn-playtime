import { queryOptions } from "@tanstack/react-query";
import {
  clearActiveAccount,
  clearCache,
  getActiveAccount,
  readCache,
  setActiveAccount,
  writeCache,
} from "@/lib/cache";
import type { DashboardData, Genre } from "@/lib/psn/types";
import { getDashboard, getRawgFranchises, getRawgGenres } from "@/server/psn";

type RawgGenres = Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>;
type RawgFranchises = Array<{ titleId: string; franchise: string }>;

/**
 * Persist a freshly-fetched dashboard so a later client load can skip the fetch.
 * Demo data is never cached, and the active account is recorded so the read side
 * can find the account-keyed entry before the next fetch resolves the account.
 */
export function primeDashboardCache(data: DashboardData): void {
  if (data.isDemo) return;
  setActiveAccount(data.profile.accountId);
  writeCache({ name: "dashboard", account: data.profile.accountId }, data);
}

/** Drop the cached dashboard + RAWG enrichment for the active account (sign-out). */
export function clearDashboardCache(): void {
  const account = getActiveAccount();
  if (account) {
    clearCache({ name: "dashboard", account });
    clearCache({ name: "rawg-genres", account });
    clearCache({ name: "rawg-franchises", account });
  }
  clearActiveAccount();
}

/** Shared query for the dashboard payload. Demo data is returned when signed out. */
export const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"] as const,
  queryFn: async (): Promise<DashboardData> => {
    const account = getActiveAccount();
    if (account) {
      const cached = readCache<DashboardData>({ name: "dashboard", account });
      if (cached) return cached;
    }
    const data = await getDashboard();
    primeDashboardCache(data);
    return data;
  },
});

export function rawgGenresQueryOptions(data: DashboardData) {
  const account = data.profile.accountId;
  return queryOptions({
    queryKey: ["dashboard", "rawg-genres", data.fetchedAt] as const,
    queryFn: async (): Promise<RawgGenres> => {
      const cached = readCache<RawgGenres>({ name: "rawg-genres", account });
      if (cached) return cached;
      const result = await getRawgGenres({
        data: {
          titles: data.games.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      });
      writeCache({ name: "rawg-genres", account }, result);
      return result;
    },
    enabled: !data.isDemo && data.games.some((game) => game.genre === "Other"),
    staleTime: Infinity,
  });
}

export function rawgFranchisesQueryOptions(data: DashboardData) {
  const account = data.profile.accountId;
  return queryOptions({
    queryKey: ["dashboard", "rawg-franchises", data.fetchedAt] as const,
    queryFn: async (): Promise<RawgFranchises> => {
      const cached = readCache<RawgFranchises>({ name: "rawg-franchises", account });
      if (cached) return cached;
      const result = await getRawgFranchises({
        data: {
          titles: data.games.map((game) => ({
            titleId: game.titleId,
            name: game.name,
            category: game.category,
          })),
        },
      });
      writeCache({ name: "rawg-franchises", account }, result);
      return result;
    },
    enabled: !data.isDemo && data.games.some((game) => game.franchise === undefined),
    staleTime: Infinity,
  });
}
