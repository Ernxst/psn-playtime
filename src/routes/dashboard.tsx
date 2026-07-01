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
} from "@/features/dashboard/enrichment/query";
import type { DashboardData, GamePlay, Genre } from "@/server/providers/account/snapshot";
import { useActiveDashboard } from "@/stores/dashboard-store";

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
  // Client-render only. The dashboard is built entirely from the user's
  // browser-local data (the persisted snapshot via `Atom.kvs` and the imported
  // transactions store). The server has none of it, so any SSR'd DOM reflects
  // demo/default state that cannot match the client's first render once the sync
  // kvs atoms read localStorage — a hydration mismatch (React #418). There is no
  // SEO value to SSR here (the route is `noindex`), so rendering client-side
  // eliminates the whole mismatch class. Mirrors `/import`, which is `ssr:false`
  // for the same client-only-data reason.
  ssr: false,
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  }),
  component: Dashboard,
  // Server render + initial client paint while the route resolves client-side.
  pendingComponent: DashboardSkeleton,
});

function Dashboard() {
  // With `ssr: false` this only ever runs on the client, where the sync kvs atom
  // reads localStorage immediately and resolves to the active account's cached
  // dashboard (falling back to the demo dataset when there is none).
  const data = useActiveDashboard();
  return <DashboardCachedView data={data} />;
}

function DashboardCachedView({ data }: { data: DashboardData }) {
  const { dashboardStore } = Route.useRouteContext();
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
  // its own atom hook, so not this render); no user interaction triggers it — it
  // fires on async query settlement, not an event (so not an event handler); and
  // writing to localStorage during render would be an impure side effect (so not
  // render-time derivation). Moving the write into the query layer was attempted
  // but is not viable: the `@/server/api/enrichment.effect` server functions
  // require the TanStack Start server runtime and cannot be driven at the query
  // layer in tests without mocking our own wrapper, which docs/rules/testing.md
  // forbids.
  useEffect(() => {
    if (!shouldPersistEnrichment(data, genresStatus, franchisesStatus)) return;
    dashboardStore.save({ ...enrichedData, enriched: true });
  }, [dashboardStore, data, enrichedData, genresStatus, franchisesStatus]);

  return (
    <DashboardView
      data={enrichedData}
      onSignOut={() => {
        dashboardStore.clearActive();
        toast.success("Signed out — showing demo data.");
      }}
      signingOut={false}
    />
  );
}
