import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  clearDashboardCache,
  dashboardQueryOptions,
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
} from "@/components/dashboard/query";
import { DashboardError, DashboardSkeleton } from "@/components/dashboard/states";
import type { DashboardData, GamePlay, Genre } from "@/lib/psn/types";
import { signOut } from "@/server/psn";

/** Apply a title's deferred RAWG enrichment, leaving unknown fields untouched. */
function enrichGame(
  game: GamePlay,
  genre: Genre | undefined,
  typicalPlaytime: number | undefined,
  franchise: string | undefined
): GamePlay {
  const next: GamePlay = { ...game };
  if (genre) next.genre = genre;
  if (typicalPlaytime !== undefined) next.typicalPlaytime = typicalPlaytime;
  if (franchise) next.franchise = franchise;
  return next;
}

/** Merge the deferred RAWG genre/playtime/franchise lookups into the games. */
function mergeRawgEnrichment(
  data: DashboardData,
  rawgGenres: Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>,
  rawgFranchises: Array<{ titleId: string; franchise: string }>
): DashboardData {
  if (rawgGenres.length === 0 && rawgFranchises.length === 0) return data;
  const genreByTitleId = new Map(rawgGenres.map((item) => [item.titleId, item.genre]));
  const playtimeByTitleId = new Map(rawgGenres.map((item) => [item.titleId, item.typicalPlaytime]));
  const franchiseByTitleId = new Map(rawgFranchises.map((item) => [item.titleId, item.franchise]));
  return {
    ...data,
    games: data.games.map((game) =>
      enrichGame(
        game,
        genreByTitleId.get(game.titleId),
        playtimeByTitleId.get(game.titleId),
        franchiseByTitleId.get(game.titleId)
      )
    ),
  };
}

export const Route = createFileRoute("/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  }),
  component: Dashboard,
  pendingComponent: DashboardSkeleton,
  errorComponent: ({ error }) => (
    <DashboardError message={error instanceof Error ? error.message : "Something went wrong."} />
  ),
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  const { data: rawgGenres = [] } = useQuery(rawgGenresQueryOptions(data));
  const { data: rawgFranchises = [] } = useQuery(rawgFranchisesQueryOptions(data));
  const queryClient = useQueryClient();
  const enrichedData = useMemo(
    () => mergeRawgEnrichment(data, rawgGenres, rawgFranchises),
    [data, rawgGenres, rawgFranchises]
  );

  const signOutMutation = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      clearDashboardCache();
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Signed out — showing demo data.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Sign out failed.");
    },
  });

  return (
    <DashboardView
      data={enrichedData}
      onSignOut={() => signOutMutation.mutate()}
      signingOut={signOutMutation.isPending}
    />
  );
}
