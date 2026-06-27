import { Link } from "@tanstack/react-router";
import { Home, Info } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import {
  applyFilters,
  type DashboardFilters,
  defaultFilters,
  type Timeframe,
} from "@/lib/psn/analytics";
import type { DashboardData } from "@/lib/psn/types";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { FilterBar } from "./filter-bar";
import { GamesTable } from "./games-table";
import { AppsExcludedNote, LifespansCard, RecencyCard, ValueCard } from "./insights";
import { KpiCards } from "./kpi-cards";
import { LlmPromptCard } from "./llm-prompt-card";
import { DashboardEmpty } from "./states";

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
  { value: "this-year", label: "This year" },
];

function TimeframeControl({
  value,
  onValueChange,
}: {
  value: Timeframe;
  onValueChange: (value: Timeframe) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

function InsightsSection({ data }: { data: DashboardData }) {
  return (
    <Section id="insights">
      <div className="grid gap-4 lg:grid-cols-3">
        <ValueCard data={data} />
        <RecencyCard data={data} />
        <LifespansCard data={data} />
        <AppsExcludedNote data={data} />
      </div>
    </Section>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  if (data.games.length === 0) return <DashboardEmpty />;
  return (
    <div className="space-y-6">
      <Section id="overview">
        <KpiCards data={data} />
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
      <InsightsSection data={data} />
      <Section id="ask-ai">
        <LlmPromptCard data={data} />
      </Section>
      <Section id="all-games">
        <GamesTable data={data} />
      </Section>
    </div>
  );
}

export function DashboardView({ data, onSignOut, signingOut }: Props) {
  const { profile } = data;
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const scoped = applyFilters(data, filters);
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <span className="truncate font-semibold">{profile.onlineId}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            render={
              <Link to="/" aria-label="Go to home page">
                <Home />
              </Link>
            }
          />
        </header>
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
          <DashboardHeader data={data} onSignOut={onSignOut} signingOut={signingOut} />
          {data.isDemo ? <DemoBanner /> : null}
          <div className="space-y-3">
            <TimeframeControl
              value={filters.timeframe}
              onValueChange={(timeframe) => setFilters((prev) => ({ ...prev, timeframe }))}
            />
            <FilterBar data={data} filters={filters} onChange={setFilters} />
          </div>
          <DashboardBody data={scoped} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
