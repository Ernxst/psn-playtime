import { Clock, Gamepad2, Hourglass, Info, Sparkles, Trophy } from "lucide-react";
import { type ComponentType, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { headlineTotals, LIFETIME_HOURS_CAVEAT, LIFETIME_HOURS_NOTE } from "@/lib/psn/analytics";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtDuration, fmtHours, fmtNumber } from "./format";

interface Kpi {
  label: string;
  value: string;
  sub: string;
  icon: ComponentType<{ className?: string }>;
  /** Optional caveat surfaced as an accessible tooltip on the value (used on hour figures). */
  valueTitle?: string;
}

function buildKpis(data: DashboardData, timeframePhrase?: string): Kpi[] {
  const t = headlineTotals(data);
  return [
    {
      label: timeframePhrase ? "Lifetime hours (filtered)" : "Lifetime play time",
      value: fmtHours(t.totalHours),
      sub: timeframePhrase
        ? `${fmtNumber(t.gamesPlayed)} games last played in ${timeframePhrase}`
        : `≈ ${fmtDuration(t.totalHours)} non-stop`,
      icon: Clock,
      valueTitle: LIFETIME_HOURS_CAVEAT,
    },
    {
      label: "That's roughly",
      value: `${fmtNumber(t.days)} days`,
      sub: `or about ${t.years.toLocaleString(undefined, { maximumFractionDigits: 1 })} years`,
      icon: Hourglass,
      valueTitle: LIFETIME_HOURS_CAVEAT,
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
      sub: t.biggestGame ? `${fmtHours(t.biggestGame.hours)} lifetime` : "",
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
        {kpi.valueTitle ? (
          <Tooltip>
            <TooltipTrigger className="block w-full cursor-help truncate text-left text-2xl font-bold">
              {kpi.value}
            </TooltipTrigger>
            <TooltipPopup className="max-w-xs">{kpi.valueTitle}</TooltipPopup>
          </Tooltip>
        ) : (
          <div className="truncate text-2xl font-bold" title={kpi.value}>
            {kpi.value}
          </div>
        )}
        <div className="truncate text-xs text-muted-foreground">{kpi.sub}</div>
      </CardContent>
    </Card>
  );
}

export function KpiCards({
  data,
  timeframePhrase,
}: {
  data: DashboardData;
  timeframePhrase?: string;
}) {
  const kpis = useMemo(() => buildKpis(data, timeframePhrase), [data, timeframePhrase]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{LIFETIME_HOURS_NOTE}</span>
      </p>
    </div>
  );
}
