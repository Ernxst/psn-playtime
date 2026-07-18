import { Link } from "@tanstack/react-router";
import { Home, Info } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import {
  applyFilters,
  currentYear,
  type DashboardFilters,
  defaultFilters,
  type Timeframe,
} from "@/features/dashboard/filters/analytics";
import { FilterBar } from "@/features/dashboard/filters/components/filter-bar";
import { GamesTable } from "@/features/dashboard/filters/components/games-table";
import {
  AppsExcludedNote,
  ComebacksCard,
  LifespansCard,
  RecencyCard,
  ValueCard,
} from "@/features/dashboard/filters/components/insights";
import { KpiCards } from "@/features/dashboard/filters/components/kpi-cards";
import { LlmPromptCard } from "@/features/dashboard/prompt/components/llm-prompt-card";
import { PurchaseHistorySection } from "@/features/dashboard/spend/components/purchase-history";
import {
  AddOnsSection,
  SpendSection,
  SpentMostSection,
} from "@/features/dashboard/spend/components/spend";
import { TrophySection } from "@/features/dashboard/trophies/components/trophies";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { RemoveTransactions } from "./remove-transactions";
import { DashboardEmpty, DashboardNoMatches } from "./states";

const LazyTopGamesSection = lazy(() =>
  import("./chart-sections").then((module) => ({ default: module.TopGamesSection }))
);
const LazyGenresFranchisesSection = lazy(() =>
  import("./chart-sections").then((module) => ({ default: module.GenresFranchisesSection }))
);
const LazyTimelineSection = lazy(() =>
  import("./chart-sections").then((module) => ({ default: module.TimelineSection }))
);

interface Props {
  data: DashboardData;
  onRefresh: (npsso: string) => Promise<void>;
  onSignOut: () => void;
  signingOut: boolean;
}

function DemoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-muted-foreground">
        You're viewing the <span className="font-medium text-foreground">demo dataset</span>. Sign
        in with your PSN token on the home page to see your own playtime.
      </p>
    </div>
  );
}

const TIMEFRAMES: ReadonlyArray<{ value: Timeframe; label: string }> = [
  { value: "all", label: "All time" },
  { value: "last-12-months", label: "Last 12 months" },
  { value: "last-2-years", label: "Last 2 years" },
  { value: "this-year", label: `This year (${currentYear()})` },
];

/** Human phrase for the active timeframe, used to reframe filtered hour totals. */
function timeframePhrase(timeframe: Timeframe): string | undefined {
  switch (timeframe) {
    case "all":
      return undefined;
    case "last-12-months":
      return "the last 12 months";
    case "last-2-years":
      return "the last 2 years";
    case "this-year":
      return `${currentYear()}`;
  }
}

function TimeframeControl({
  value,
  onValueChange,
}: {
  value: Timeframe;
  onValueChange: (value: Timeframe) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <Tabs
          value={value}
          onValueChange={(next) => {
            const match = TIMEFRAMES.find((t) => t.value === next);
            if (match) onValueChange(match.value);
          }}
        >
          <TabsList>
            {TIMEFRAMES.map((t) => (
              <TabsTab key={t.value} value={t.value}>
                {t.label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <p className="text-xs text-muted-foreground">
        Windowed by last-played activity, not hours-in-period. PSN only reports lifetime hours per
        game.
      </p>
    </div>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      {children}
    </section>
  );
}

function ChartPlaceholder({ height = 340 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

function DeferredSection({ children, height }: { children: React.ReactNode; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);

  const subscribe = useCallback((onStoreChange: () => void) => {
    const element = ref.current;
    if (!element) return () => {};

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          visibleRef.current = true;
          observer.disconnect();
          onStoreChange();
        }
      },
      { rootMargin: "400px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // One-shot reveal flag read during render: useSyncExternalStore subscribes the observer,
  // the snapshot is the flag, and the server snapshot defaults to not-visible.
  const visible = useSyncExternalStore(
    subscribe,
    () => visibleRef.current,
    () => false
  );

  return (
    <div ref={ref}>
      {visible ? (
        <Suspense fallback={<ChartPlaceholder height={height} />}>{children}</Suspense>
      ) : (
        <ChartPlaceholder height={height} />
      )}
    </div>
  );
}

function SpendSections({ data }: { data: DashboardData }) {
  return (
    <>
      <Section id="spend">
        <SpendSection data={data} />
      </Section>
      <Section id="purchase-history">
        <PurchaseHistorySection data={data} />
      </Section>
      <Section id="spent-most">
        <SpentMostSection data={data} />
      </Section>
      <Section id="add-ons">
        <AddOnsSection data={data} />
      </Section>
      <Section id="remove-transactions">
        <RemoveTransactions />
      </Section>
    </>
  );
}

function InsightsSection({ data }: { data: DashboardData }) {
  return (
    <Section id="insights">
      <div className="grid gap-4 lg:grid-cols-3">
        <ValueCard data={data} />
        <RecencyCard data={data} />
        <LifespansCard data={data} />
        <ComebacksCard data={data} />
        <AppsExcludedNote data={data} />
      </div>
    </Section>
  );
}

interface DashboardBodyProps {
  /** Filter-scoped library powering the game-centric views. */
  data: DashboardData;
  /** Unfiltered, account-wide library for the spend sections. */
  accountData: DashboardData;
  timeframe: Timeframe;
}

function DashboardBody({ data, accountData, timeframe }: DashboardBodyProps) {
  return (
    <div className="space-y-6">
      <Section id="overview">
        <KpiCards data={data} timeframePhrase={timeframePhrase(timeframe)} />
      </Section>
      <Section id="top-games">
        <DeferredSection height={430}>
          <LazyTopGamesSection data={data} />
        </DeferredSection>
      </Section>
      <Section id="genres-franchises">
        <DeferredSection height={390}>
          <LazyGenresFranchisesSection data={data} />
        </DeferredSection>
      </Section>
      <Section id="timeline">
        <DeferredSection height={350}>
          <LazyTimelineSection data={data} />
        </DeferredSection>
      </Section>
      <Section id="trophies">
        <TrophySection data={data} />
      </Section>
      <InsightsSection data={data} />
      <Section id="ask-ai">
        <LlmPromptCard data={data} />
      </Section>
      <SpendSections data={accountData} />
      <Section id="all-games">
        <GamesTable data={data} />
      </Section>
    </div>
  );
}

function DashboardContent({
  data,
  filters,
  onClearFilters,
}: {
  data: DashboardData;
  filters: DashboardFilters;
  onClearFilters: () => void;
}) {
  const scoped = useMemo(() => applyFilters(data, filters), [data, filters]);
  if (scoped.games.length === 0) {
    return data.games.length > 0 ? (
      <DashboardNoMatches onClear={onClearFilters} />
    ) : (
      <DashboardEmpty />
    );
  }
  return <DashboardBody data={scoped} accountData={data} timeframe={filters.timeframe} />;
}

/**
 * Defer only the free-text search so typing keeps the search input responsive (it stays
 * bound to the immediate `filters`), while the expensive `applyFilters` re-filter lags
 * behind to the settled term. Every other facet still applies immediately.
 */
function useDeferredFilters(filters: DashboardFilters): DashboardFilters {
  const deferredSearch = useDeferredValue(filters.search);
  return useMemo(() => ({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
}

function DashboardTopBar({ onlineId }: { onlineId: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="hit-area-2" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <span className="truncate font-semibold">{onlineId}</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto hit-area-2"
        render={
          <Link to="/" aria-label="Go to home page">
            <Home />
          </Link>
        }
      />
    </header>
  );
}

export function DashboardView(props: Props) {
  const { data } = props;
  const { profile } = data;
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const deferredFilters = useDeferredFilters(filters);
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardTopBar onlineId={profile.onlineId} />
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
          <DashboardHeader {...props} />
          {data.isDemo ? <DemoBanner /> : null}
          <div className="space-y-3">
            <TimeframeControl
              value={filters.timeframe}
              onValueChange={(timeframe) => setFilters((prev) => ({ ...prev, timeframe }))}
            />
            <FilterBar data={data} filters={filters} onChange={setFilters} />
          </div>
          <DashboardContent
            data={data}
            filters={deferredFilters}
            onClearFilters={() => setFilters(defaultFilters)}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
