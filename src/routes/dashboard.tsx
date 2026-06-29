import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { DashboardSkeleton } from "@/features/dashboard/components/states";
import {
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
  shouldPersistEnrichment,
} from "@/features/dashboard/query";
import { clearActiveAccount, saveDashboard, useActiveDashboard } from "@/lib/dashboard-store";
import type { DashboardData, GamePlay, Genre } from "@/server/providers/account/snapshot";

/** Apply a title's deferred RAWG enrichment, leaving unknown fields untouched. */
function enrichGame(
  game: GamePlay,
  genre: Genre | undefined,
  typicalPlaytime: number | undefined,
  franchise: string | undefined
): GamePlay {
  return {
    ...game,
    ...(genre ? { genre } : {}),
    ...(typicalPlaytime !== undefined ? { typicalPlaytime } : {}),
    ...(franchise ? { franchise } : {}),
  };
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
  const { data: rawgGenres = [], status: genresStatus } = useQuery(rawgGenresQueryOptions(data));
  const { data: rawgFranchises = [], status: franchisesStatus } = useQuery(
    rawgFranchisesQueryOptions(data)
  );
  const enrichedData = useMemo(
    () => mergeRawgEnrichment(data, rawgGenres, rawgFranchises),
    [data, rawgGenres, rawgFranchises]
  );

  // Fire-and-forget: write the enriched snapshot to localStorage (via the
  // dashboard store) once the RAWG lookups have actually SUCCEEDED, so revisits
  // render fully enriched without re-hitting RAWG. `shouldPersistEnrichment`
  // gates on the query `status` (not `fetchStatus`), so a failed lookup leaves
  // the data un-enriched and a later visit retries (#136).
  //
  // This stays a `useEffect` per docs/rules/effects.md: it pushes to localStorage
  // and nothing here is read back during this render (the store re-publishes via
  // its own `useSyncExternalStore`, so not that hook); no user interaction
  // triggers it — it fires on async query settlement, not an event (so not an
  // event handler); and writing to localStorage during render would be an impure
  // side effect (so not render-time derivation). Moving the write into the query
  // layer was attempted but is not viable: the `@/server/api/enrichment.effect` server functions
  // require the TanStack Start server runtime and cannot be driven at the query
  // layer in tests without mocking our own wrapper, which docs/rules/testing.md
  // forbids.
  useEffect(() => {
    if (!shouldPersistEnrichment(data, genresStatus, franchisesStatus)) return;
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
