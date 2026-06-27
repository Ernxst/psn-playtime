import { Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { DashboardData } from "@/lib/psn/types";
import { ChartCard } from "./chart-card";
import { FranchiseChart, GenreChart, SessionChart, TopGamesChart, YearChart } from "./charts";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { GamesTable } from "./games-table";
import { AppsExcludedNote, LifespansCard, RecencyCard, ValueCard } from "./insights";
import { KpiCards } from "./kpi-cards";
import { DashboardEmpty } from "./states";

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

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      {children}
    </section>
  );
}

function GenresFranchisesSection({ data }: { data: DashboardData }) {
  return (
    <Section id="genres-franchises">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="What kind of player are you?" caption="Share of your playtime by genre.">
          <GenreChart data={data} />
        </ChartCard>
        <ChartCard
          title="Favourite franchises"
          caption="Series you keep coming back to, by total hours."
        >
          <FranchiseChart data={data} />
        </ChartCard>
      </div>
    </Section>
  );
}

function TimelineSection({ data }: { data: DashboardData }) {
  return (
    <Section id="timeline">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Hours by most-recent year"
          caption="A proxy timeline: each game's full playtime is placed in the year you last played it (PSN only gives lifetime totals)."
        >
          <YearChart data={data} />
        </ChartCard>
        <ChartCard
          title="Binge or dip-in?"
          caption="Average hours per session — tall bars are marathon games, short bars are quick visits."
        >
          <SessionChart data={data} />
        </ChartCard>
      </div>
    </Section>
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
        <ChartCard
          title="Top games by hours"
          caption="The titles you've sunk the most lifetime hours into."
        >
          <TopGamesChart data={data} />
        </ChartCard>
      </Section>
      <GenresFranchisesSection data={data} />
      <TimelineSection data={data} />
      <InsightsSection data={data} />
      <Section id="all-games">
        <GamesTable data={data} />
      </Section>
    </div>
  );
}

export function DashboardView({ data, onSignOut, signingOut }: Props) {
  const { profile } = data;
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <span className="truncate font-semibold">{profile.onlineId}</span>
        </header>
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
          <DashboardHeader data={data} onSignOut={onSignOut} signingOut={signingOut} />
          {data.isDemo ? <DemoBanner /> : null}
          <DashboardBody data={data} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
