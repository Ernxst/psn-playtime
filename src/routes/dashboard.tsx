import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  dashboardQueryOptions,
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
} from "@/components/dashboard/query";
import { DashboardError, DashboardSkeleton } from "@/components/dashboard/states";
import { signOut } from "@/server/psn";

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
  const enrichedData = useMemo(() => {
    if (rawgGenres.length === 0 && rawgFranchises.length === 0) return data;
    const genreByTitleId = new Map(rawgGenres.map((item) => [item.titleId, item.genre]));
    const franchiseByTitleId = new Map(
      rawgFranchises.map((item) => [item.titleId, item.franchise])
    );
    return {
      ...data,
      games: data.games.map((game) => {
        const genre = genreByTitleId.get(game.titleId);
        const franchise = franchiseByTitleId.get(game.titleId);
        if (!genre && !franchise) return game;
        return { ...game, ...(genre && { genre }), ...(franchise && { franchise }) };
      }),
    };
  }, [data, rawgGenres, rawgFranchises]);

  const signOutMutation = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
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
