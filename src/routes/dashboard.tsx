import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { dashboardQueryOptions, rawgGenresQueryOptions } from "@/components/dashboard/query";
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
  const queryClient = useQueryClient();
  const enrichedData = useMemo(() => {
    if (rawgGenres.length === 0) return data;
    const byTitleId = new Map(rawgGenres.map((item) => [item.titleId, item.genre]));
    return {
      ...data,
      games: data.games.map((game) => {
        const genre = byTitleId.get(game.titleId);
        return genre ? { ...game, genre } : game;
      }),
    };
  }, [data, rawgGenres]);

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
