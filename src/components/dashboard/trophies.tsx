import { Award, Crown, Info, Target, TrendingUp, Trophy } from "lucide-react";
import { type ComponentType, useMemo } from "react";
// Charts are deliberately server-rendered for first paint, so recharts is a
// static import rather than a lazy chunk.
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { summariseTrophies, type TrophyGame, type TrophySummary } from "@/lib/psn/trophies";
import type { DashboardData } from "@/lib/psn/types";
import { fmtNumber, fmtRelative } from "./format";

/** Plain-English "based on N of M games" denominator the per-game cards share. */
function matchedDenominator(summary: TrophySummary): string {
  return `Based on the ${fmtNumber(summary.matchedGames)} of ${fmtNumber(
    summary.totalGames
  )} games with a matched trophy list. Games with no matched list are unknown, not 0%.`;
}

interface Kpi {
  label: string;
  value: string;
  sub: string;
  icon: ComponentType<{ className?: string }>;
}

function buildKpis(summary: TrophySummary): Kpi[] {
  return [
    {
      label: "Trophy level",
      value: fmtNumber(summary.trophyLevel),
      sub: `${fmtNumber(summary.levelProgress)}% to the next level`,
      icon: Trophy,
    },
    {
      label: "Trophies earned",
      value: fmtNumber(summary.totalTrophies),
      sub: `${fmtNumber(summary.earned.gold)} gold · ${fmtNumber(summary.earned.silver)} silver · ${fmtNumber(summary.earned.bronze)} bronze`,
      icon: Award,
    },
    {
      label: "Platinums",
      value: fmtNumber(summary.earned.platinum),
      sub:
        summary.matchedGames > 0
          ? `${fmtNumber(summary.completedGames)} games fully completed`
          : "no matched trophy lists yet",
      icon: Crown,
    },
    {
      label: "Avg completion",
      value: summary.matchedGames > 0 ? `${fmtNumber(summary.avgCompletion)}%` : "—",
      sub:
        summary.matchedGames > 0
          ? `across ${fmtNumber(summary.matchedGames)} matched games`
          : "no matched trophy lists yet",
      icon: TrendingUp,
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
        <div className="truncate text-2xl font-bold tabular-nums" title={kpi.value}>
          {kpi.value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{kpi.sub}</div>
      </CardContent>
    </Card>
  );
}

function TrophyKpis({ summary }: { summary: TrophySummary }) {
  const kpis = useMemo(() => buildKpis(summary), [summary]);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}

const distributionConfig = {
  count: { label: "Earned" },
} satisfies ChartConfig;

const TROPHY_COLOURS: Record<string, string> = {
  Platinum: "var(--chart-1)",
  Gold: "var(--chart-2)",
  Silver: "var(--chart-3)",
  Bronze: "var(--chart-4)",
};

interface DistributionRow {
  type: string;
  count: number;
  fill?: string;
}

const distributionTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        nameKey="type"
        formatter={(v) => `${Number(v).toLocaleString()} earned`}
      />
    }
  />
);

/** The bars themselves, kept separate so the card stays small. */
function DistributionChart({ rows, label }: { rows: DistributionRow[]; label: string }) {
  return (
    <ChartContainer
      config={distributionConfig}
      className="aspect-auto h-[220px] w-full"
      // role=img + aria-label give the chart a text equivalent (issue #156).
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={label}
    >
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
        <XAxis type="number" dataKey="count" hide />
        <YAxis
          type="category"
          dataKey="type"
          width={64}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        {distributionTooltip}
        <Bar dataKey="count" radius={4}>
          {rows.map((row) => (
            <Cell key={row.type} fill={row.fill} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => fmtNumber(Number(v))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Earned platinum/gold/silver/bronze split — horizontal bars (no rarity). */
function DistributionCard({ summary }: { summary: TrophySummary }) {
  const rows = useMemo(
    () => summary.distribution.map((row) => ({ ...row, fill: TROPHY_COLOURS[row.type] })),
    [summary]
  );
  const label = `Earned trophies by type: ${rows
    .map((row) => `${fmtNumber(row.count)} ${row.type.toLowerCase()}`)
    .join(", ")}.`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="size-4" /> Trophy split
        </CardTitle>
        <CardDescription>
          How your {fmtNumber(summary.totalTrophies)} earned trophies break down by type. We don't
          collect rarity, so none is shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DistributionChart rows={rows} label={label} />
      </CardContent>
    </Card>
  );
}

/** Completion-spectrum buckets, scoped to matched games. */
function CompletionSpectrumCard({ summary }: { summary: TrophySummary }) {
  if (summary.matchedGames === 0) return null;
  const max = Math.max(...summary.completionBuckets.map((b) => b.count), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" /> Completion spectrum
        </CardTitle>
        <CardDescription>{matchedDenominator(summary)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {summary.completionBuckets.map((bucket) => (
          <div key={bucket.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{bucket.label}</span>
              <span className="tabular-nums">{fmtNumber(bucket.count)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-[var(--chart-2)]"
                style={{ width: `${(bucket.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GameRow({ game, meta }: { game: TrophyGame; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-muted-foreground">{game.name}</span>
      <span className="shrink-0 tabular-nums text-xs">{meta}</span>
    </div>
  );
}

/** Games where a platinum was earned. */
function PlatinumsCard({ summary }: { summary: TrophySummary }) {
  const top = summary.platinums.slice(0, 12);
  if (top.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="size-4" /> Your platinums
        </CardTitle>
        <CardDescription>
          The {fmtNumber(summary.platinums.length)} games you've platted, most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map((game) => (
          <GameRow key={game.titleId} game={game} meta={fmtRelative(game.lastEarnedAt)} />
        ))}
      </CardContent>
    </Card>
  );
}

/** Plat-capable games ≥80% done but not yet platted — the actionable list. */
function WithinReachCard({ summary }: { summary: TrophySummary }) {
  const top = summary.withinReach.slice(0, 12);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" /> Platinum within reach
        </CardTitle>
        <CardDescription>
          Games with a platinum that you're 80%+ through but haven't finished: the quickest plats
          left.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.length === 0 ? (
          <p className="text-muted-foreground">
            No plat-capable game is 80%+ complete yet. Keep hunting.
          </p>
        ) : (
          top.map((game) => (
            <GameRow key={game.titleId} game={game} meta={`${fmtNumber(game.progress)}%`} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Matched games by most-recently-earned trophy — what you've been hunting. */
function RecentActivityCard({ summary }: { summary: TrophySummary }) {
  const top = summary.recent.slice(0, 8);
  if (top.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" /> Recent trophy activity
        </CardTitle>
        <CardDescription>
          Games you've earned a trophy in most recently. PSN only timestamps each game's latest
          trophy, not every one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map((game) => (
          <GameRow
            key={game.titleId}
            game={game}
            meta={`${fmtNumber(game.progress)}% · ${fmtRelative(game.lastEarnedAt)}`}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard trophy section. Account KPIs and the earned-trophy split come from
 * the profile; every per-game card is scoped to matched trophy lists and states
 * its denominator. No rarity is shown or implied — we don't collect it.
 */
export function TrophySection({ data }: { data: DashboardData }) {
  const summary = useMemo(() => summariseTrophies(data), [data]);
  return (
    <div className="space-y-4">
      <TrophyKpis summary={summary} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionCard summary={summary} />
        <CompletionSpectrumCard summary={summary} />
        <PlatinumsCard summary={summary} />
        <WithinReachCard summary={summary} />
      </div>
      <RecentActivityCard summary={summary} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{matchedDenominator(summary)}</span>
      </p>
    </div>
  );
}
