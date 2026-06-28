import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { rawgFranchisesQueryOptions, rawgGenresQueryOptions } from "@/components/dashboard/query";
import { DashboardSkeleton } from "@/components/dashboard/states";
import { clearActiveAccount, saveDashboard, useActiveDashboard } from "@/lib/dashboard-store";
import type { DashboardData, GamePlay, Genre } from "@/lib/psn/types";

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
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = useActiveDashboard();
  // `undefined` during SSR and the initial client render: render a shell until
  // hydration reads the cached data from localStorage (revisit-from-cache).
  if (!data) return <DashboardSkeleton />;
  return <DashboardCachedView data={data} />;
}

function DashboardCachedView({ data }: { data: DashboardData }) {
  const { data: rawgGenres = [], fetchStatus: genresStatus } = useQuery(
    rawgGenresQueryOptions(data)
  );
  const { data: rawgFranchises = [], fetchStatus: franchisesStatus } = useQuery(
    rawgFranchisesQueryOptions(data)
  );
  const enrichedData = useMemo(
    () => mergeRawgEnrichment(data, rawgGenres, rawgFranchises),
    [data, rawgGenres, rawgFranchises]
  );

  // Persist the enriched data back to the client cache once the RAWG lookups
  // settle, so revisits render fully enriched without re-hitting RAWG. The
  // `enriched` flag (set here) gates the lookups off, breaking the save loop.
  useEffect(() => {
    if (data.isDemo || data.enriched) return;
    if (genresStatus !== "idle" || franchisesStatus !== "idle") return;
    saveDashboard({ ...enrichedData, enriched: true });
  }, [data, enrichedData, genresStatus, franchisesStatus]);

  return (
    <DashboardView
      data={enrichedData}
      onSignOut={() => {
        clearActiveAccount();
        toast.success("Signed out — showing demo data.");
      }}
      signingOut={false}
    />
  );
}
