import { Clock, Gamepad2, Hourglass, Sparkles, Trophy } from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { headlineTotals } from "@/lib/psn/analytics";
import type { DashboardData } from "@/lib/psn/types";
import { fmtDuration, fmtHours, fmtNumber } from "./format";

interface Kpi {
  label: string;
  value: string;
  sub: string;
  icon: ComponentType<{ className?: string }>;
}

function buildKpis(data: DashboardData): Kpi[] {
  const t = headlineTotals(data);
  return [
    {
      label: "Total play time",
      value: fmtHours(t.totalHours),
      sub: `≈ ${fmtDuration(t.totalHours)} non-stop`,
      icon: Clock,
    },
    {
      label: "That's roughly",
      value: `${fmtNumber(t.days)} days`,
      sub: `or about ${t.years.toLocaleString(undefined, { maximumFractionDigits: 1 })} years`,
      icon: Hourglass,
    },
    {
      label: "Games played",
      value: fmtNumber(t.gamesPlayed),
      sub: `${fmtNumber(t.sessions)} play sessions`,
      icon: Gamepad2,
    },
    {
      label: "Trophy level",
      value: fmtNumber(t.trophyLevel),
      sub: `${fmtNumber(data.profile.totalTrophies)} trophies earned`,
      icon: Trophy,
    },
    {
      label: "Biggest game",
      value: t.biggestGame?.name ?? "—",
      sub: t.biggestGame ? `${fmtHours(t.biggestGame.hours)} all-time` : "",
      icon: Sparkles,
    },
  ];
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <kpi.icon className="size-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{kpi.label}</span>
        </div>
        <div className="truncate text-2xl font-bold" title={kpi.value}>
          {kpi.value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{kpi.sub}</div>
      </CardContent>
    </Card>
  );
}

export function KpiCards({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {buildKpis(data).map((k) => (
        <KpiCard key={k.label} kpi={k} />
      ))}
    </div>
  );
}
