import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { signedInPreviewDashboard } from "@/domain/mock";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { DashboardError, DashboardSkeleton } from "@/features/dashboard/components/states";
import {
  enrichmentForSnapshot,
  enrichmentViewState,
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
  settledEnrichmentState,
} from "@/features/dashboard/enrichment/query";
import {
  enrichmentComplete,
  mergeRawgEnrichment,
  sameEnrichmentState,
} from "@/features/dashboard/enrichment/state";
import { activateSignedInPreview, prototypeDashboard } from "@/features/prototype/prototype-data";
import { signInWithToken } from "@/server/api/account.effect";
import type { DashboardData } from "@/server/providers/account/snapshot";
import {
  type DashboardStore,
  useActiveDashboard,
  useActiveDashboardEnrichment,
} from "@/stores/dashboard-store";

type PrototypeState = "loading" | "error" | "empty" | "partial" | "signed-in";
interface DashboardSearch {
  prototypeState?: PrototypeState;
}

const prototypeStates: readonly PrototypeState[] = [
  "loading",
  "error",
  "empty",
  "partial",
  "signed-in",
];

function prototypeState(value: unknown): PrototypeState | undefined {
  if (typeof value !== "string") return undefined;
  return prototypeStates.find((state) => state === value);
}

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search): DashboardSearch => {
    const state = prototypeState(search.prototypeState);
    return state ? { prototypeState: state } : {};
  },
  loaderDeps: ({ search }) => ({ prototypeState: search.prototypeState }),
  // Client-render only. The dashboard is built entirely from the user's
  // browser-local data (the persisted snapshot via `Atom.kvs` and the imported
  // transactions store). The server has none of it, so any SSR'd DOM reflects
  // demo/default state that cannot match the client's first render once the sync
  // kvs atoms read localStorage — a hydration mismatch (React #418). There is no
  // SEO value to SSR here (the route is `noindex`), so rendering client-side
  // eliminates the whole mismatch class. Mirrors `/import`, which is `ssr:false`
  // for the same client-only-data reason.
  ssr: false,
  loader: ({ context, deps }) => {
    if (deps.prototypeState === "signed-in") activateSignedInPreview(context.dashboardStore);
  },
  head: () => ({
    meta: [
      { title: "Playloom — Your gaming life, woven together" },
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

function emptyDashboard(data: DashboardData): DashboardData {
  return {
    ...prototypeDashboard(data),
    games: [],
    meta: { ...data.meta, totalGames: 0, totalHours: 0, totalSessions: 0, appsExcluded: [] },
  };
}

function partialDashboard(data: DashboardData): DashboardData {
  const partial = prototypeDashboard(data);
  const games = partial.games.map((game) => {
    const result = { ...game, playCount: 0 };
    delete result.franchise;
    delete result.imageUrl;
    delete result.trophy;
    delete result.typicalPlaytime;
    return result;
  });
  return {
    ...partial,
    games,
    enriched: false,
    trophiesUnavailable: true,
    meta: { ...partial.meta, totalSessions: 0 },
  };
}

const prototypeViews: Record<PrototypeState, (data: DashboardData) => ReactNode> = {
  loading: (data) => <DashboardSkeleton profile={data.profile} />,
  error: (data) => (
    <DashboardError
      message="PlayStation could not return this archive. Your existing browser data is unchanged."
      onRetry={() => window.location.assign("/dashboard")}
      profile={data.profile}
    />
  ),
  empty: (data) => <DashboardCachedView data={emptyDashboard(data)} />,
  partial: (data) => <DashboardCachedView data={partialDashboard(data)} partialData />,
  "signed-in": (data) => (
    <DashboardCachedView
      data={prototypeDashboard(data)}
      safeDemo={data.profile.accountId === signedInPreviewDashboard.profile.accountId}
    />
  ),
};

function PrototypeDashboard({ state, data }: { state: PrototypeState; data: DashboardData }) {
  return prototypeViews[state](data);
}

function Dashboard() {
  // With `ssr: false` this only ever runs on the client, where the sync kvs atom
  // reads localStorage immediately and resolves to the active account's cached
  // dashboard (falling back to the demo dataset when there is none).
  const data = useActiveDashboard();
  const { prototypeState: state } = Route.useSearch();
  return state ? (
    <PrototypeDashboard state={state} data={data} />
  ) : (
    <DashboardCachedView data={prototypeDashboard(data)} />
  );
}

interface CachedViewProps {
  data: DashboardData;
  safeDemo?: boolean;
  partialData?: boolean;
}

function accountActions(data: DashboardData, safeDemo: boolean, store: DashboardStore) {
  if (data.isDemo) return {};
  const onRefresh = safeDemo
    ? () => new Promise<void>((resolve) => window.setTimeout(resolve, 700))
    : async (npsso: string) => {
        const refreshed = await signInWithToken({ data: { npsso } });
        if (refreshed.profile.accountId !== data.profile.accountId) {
          throw new Error("That token belongs to a different PlayStation account.");
        }
        store.save(refreshed);
      };
  return {
    onRefresh,
    onSignOut: () => {
      store.clearActive();
      toast.success("Signed out — showing demo data.");
    },
  };
}

function useRawgEnrichment(
  data: DashboardData,
  partialData: boolean,
  persisted: ReturnType<typeof useActiveDashboardEnrichment>
) {
  const genres = useQuery(rawgGenresQueryOptions(data, persisted));
  const franchises = useQuery(rawgFranchisesQueryOptions(data, persisted));
  const state = enrichmentViewState(data, persisted, {
    genres: { status: genres.status, outcome: genres.data?.outcome },
    franchises: { status: franchises.status, outcome: franchises.data?.outcome },
  });
  const enrichedData = useMemo(
    () =>
      partialData
        ? data
        : mergeRawgEnrichment(data, genres.data?.items ?? [], franchises.data?.items ?? []),
    [data, franchises.data?.items, genres.data?.items, partialData]
  );
  return {
    data: enrichedData,
    settled: settledEnrichmentState(data.fetchedAt, state),
    presentation: {
      genres: {
        status: state.genres,
        retrying: genres.fetchStatus === "fetching",
        onRetry: () => void genres.refetch(),
      },
      franchises: {
        status: state.franchises,
        retrying: franchises.fetchStatus === "fetching",
        onRetry: () => void franchises.refetch(),
      },
    },
  };
}

function DashboardCachedView({ data, safeDemo = false, partialData = false }: CachedViewProps) {
  const { dashboardStore } = Route.useRouteContext();
  const storedEnrichment = useActiveDashboardEnrichment();
  const persisted = enrichmentForSnapshot(data, storedEnrichment);
  const enrichment = useRawgEnrichment(data, partialData, persisted);

  // Synchronise settled query results to the Atom-backed localStorage cache;
  // async settlement is not a user event, and render-time writes would be impure.
  useEffect(() => {
    if (safeDemo || partialData || enrichment.settled === null) return;
    if (sameEnrichmentState(persisted, enrichment.settled) && enrichment.data === data) return;
    dashboardStore.saveEnrichment(data.profile.accountId, enrichment.settled);
    dashboardStore.save({ ...enrichment.data, enriched: enrichmentComplete(enrichment.settled) });
  }, [dashboardStore, data, enrichment, partialData, persisted, safeDemo]);

  return (
    <DashboardView
      data={enrichment.data}
      safeDemo={safeDemo}
      partialData={partialData}
      signingOut={false}
      enrichment={enrichment.presentation}
      {...accountActions(data, safeDemo, dashboardStore)}
    />
  );
}
