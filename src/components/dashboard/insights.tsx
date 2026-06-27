import { Activity, CalendarClock, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LIFETIME_HOURS_CAVEAT, lifespans, recency, valuePerGame } from "@/lib/psn/analytics";
import type { DashboardData } from "@/lib/psn/types";
import { fmtHours, fmtNumber } from "./format";

/** Games with the longest first→last play span — the ones you keep returning to. */
export function LifespansCard({ data }: { data: DashboardData }) {
  const top = lifespans(data, 12)
    .toSorted((a, b) => b.days - a.days)
    .slice(0, 5);
  if (top.length === 0) return null;
  const span = (days: number) => (days >= 365 ? `${(days / 365).toFixed(1)} yrs` : `${days} days`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" /> Kept coming back to
        </CardTitle>
        <CardDescription>Longest gap between your first and last session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map((g) => (
          <div key={g.name} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{g.name}</span>
            <span className="shrink-0 tabular-nums">{span(g.days)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** "How much do you get out of a game" averages. */
export function ValueCard({ data }: { data: DashboardData }) {
  const v = valuePerGame(data);
  const stats = [
    { label: "Lifetime hours per game", value: fmtHours(v.avgHoursPerGame) },
    { label: "Sessions per game", value: fmtNumber(v.avgSessionsPerGame) },
    { label: "Avg session length", value: `${v.avgSessionLength} h` },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What a game is worth to you</CardTitle>
        <CardDescription>
          Typical mileage you get from each title in your library. Hours are lifetime totals.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 divide-x divide-border">
        {stats.map((s) => (
          <div key={s.label} className="px-2 text-center first:pl-0 last:pr-0">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Active-this-year vs dormant split. */
export function RecencyCard({ data }: { data: DashboardData }) {
  const r = recency(data);
  const total = r.activeGames + r.dormantGames || 1;
  const activePct = Math.round((r.activeGames / total) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" /> Still in rotation
        </CardTitle>
        <CardDescription>Games you've touched in {r.thisYear} vs. ones gone quiet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          <div className="bg-[var(--chart-2)]" style={{ width: `${activePct}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <div className="font-semibold">{r.activeGames} active</div>
            <div className="text-xs text-muted-foreground" title={LIFETIME_HOURS_CAVEAT}>
              {fmtHours(r.activeHours)} lifetime
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{r.dormantGames} dormant</div>
            <div className="text-xs text-muted-foreground" title={LIFETIME_HOURS_CAVEAT}>
              {fmtHours(r.dormantHours)} lifetime
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Transparency note: apps deliberately excluded from the game stats. */
export function AppsExcludedNote({ data }: { data: DashboardData }) {
  const apps = data.meta.appsExcluded;
  if (apps.length === 0) return null;
  const totalAppHours = apps.reduce((sum, a) => sum + a.hours, 0);
  // Merge duplicate app names so the list reads cleanly.
  const merged = new Map<string, number>();
  for (const a of apps) merged.set(a.name, (merged.get(a.name) ?? 0) + a.hours);
  const top = [...merged.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4" /> Not counted: streaming & apps
        </CardTitle>
        <CardDescription>
          {fmtHours(totalAppHours)} of lifetime YouTube, Netflix and other app time is excluded so
          the numbers above are games only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map(([name, hours]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-muted-foreground">{name}</span>
            <span className="tabular-nums">{fmtHours(hours)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex items-center justify-between font-medium">
          <span>Total excluded</span>
          <span className="tabular-nums">{fmtHours(totalAppHours)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
