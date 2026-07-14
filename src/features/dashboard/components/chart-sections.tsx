import {
  FranchiseChart,
  GenreChart,
  SessionChart,
  TopGamesChart,
  YearChart,
} from "@/features/dashboard/filters/components/charts";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { ChartCard } from "./chart-card";

export function TopGamesSection({ data }: { data: DashboardData }) {
  return (
    <ChartCard
      title="Recorded hours"
      caption="The titles with the most PSN-recorded lifetime hours."
    >
      <TopGamesChart data={data} />
    </ChartCard>
  );
}

export function GenresFranchisesSection({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="What kind of player are you?"
        caption="Share of your lifetime hours by genre."
      >
        <GenreChart data={data} />
      </ChartCard>
      <ChartCard
        title="Favourite franchises"
        caption="Series you keep coming back to, by total lifetime hours."
      >
        <FranchiseChart data={data} />
      </ChartCard>
    </div>
  );
}

export function TimelineSection({ data }: { data: DashboardData }) {
  return (
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
  );
}
