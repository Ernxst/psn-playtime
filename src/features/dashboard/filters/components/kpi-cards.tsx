import { Clock, Gamepad2, Info, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { headlineTotals, LIFETIME_HOURS_NOTE } from "@/features/dashboard/filters/analytics";
import { fmtDuration, fmtHours, fmtNumber } from "@/features/dashboard/format";
import type { DashboardData } from "@/server/providers/account/snapshot";

function excludedApps(data: DashboardData): string | undefined {
  if (data.meta.appsExcluded.length === 0) return undefined;
  const hours = data.meta.appsExcluded.reduce((total, app) => total + app.hours, 0);
  return `Account-wide, ${fmtHours(hours)} of streaming and app time is excluded from every games-only total.`;
}

function Lifetime({ data, timeframePhrase }: { data: DashboardData; timeframePhrase?: string }) {
  const totals = headlineTotals(data);
  const apps = excludedApps(data);
  return (
    <div className="space-y-1 sm:pr-6">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="size-4" />
        {timeframePhrase ? "Lifetime hours (filtered)" : "Lifetime play time"}
      </p>
      <p className="text-3xl font-bold tabular-nums">{fmtHours(totals.totalHours)}</p>
      <p className="text-xs text-muted-foreground">
        {timeframePhrase
          ? `Games last played in ${timeframePhrase}; still lifetime hours.`
          : `About ${fmtDuration(totals.totalHours)} in total.`}
      </p>
      {apps ? <p className="pt-2 text-xs text-muted-foreground">{apps}</p> : null}
    </div>
  );
}

export function KpiCards({
  data,
  timeframePhrase,
}: {
  data: DashboardData;
  timeframePhrase?: string;
}) {
  const totals = headlineTotals(data);
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
          <Lifetime data={data} timeframePhrase={timeframePhrase} />
          <div className="space-y-1 sm:px-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Gamepad2 className="size-4" /> Games played
            </p>
            <p className="text-3xl font-bold tabular-nums">{fmtNumber(totals.gamesPlayed)}</p>
          </div>
          <div className="space-y-1 sm:pl-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <RotateCcw className="size-4" /> Launches
            </p>
            <p className="text-3xl font-bold tabular-nums">{fmtNumber(totals.sessions)}</p>
            <p className="text-xs text-muted-foreground">Recorded game starts.</p>
          </div>
        </CardContent>
      </Card>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{LIFETIME_HOURS_NOTE}</span>
      </p>
    </div>
  );
}
