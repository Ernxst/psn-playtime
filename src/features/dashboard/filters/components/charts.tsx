import type { ReactNode } from "react";
import { useMemo } from "react";
// Charts are deliberately server-rendered for first paint, so recharts is a
// static import rather than a lazy chunk.
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  bingeVsDipIn,
  genreBreakdown,
  type GenreSlice,
  hoursByYear,
  topFranchises,
  topGamesByHours,
} from "@/features/dashboard/filters/analytics";
import { chartColor } from "@/features/dashboard/format";
import type { DashboardData } from "@/server/providers/account/snapshot";

const hoursConfig = {
  hours: { label: "Hours", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** A chart's screen-reader text equivalent: `<title>: a, b, c.` (issue #156). */
function chartLabel(title: string, parts: string[]): string {
  return `${title}: ${parts.join(", ")}.`;
}

type HorizontalBarChartProps = {
  label: string;
  className: string;
  data: unknown[];
  margin: { left: number; right: number };
  valueKey: string;
  categoryKey: string;
  yAxisWidth: number;
  categoryTickFormatter?: (value: string) => string;
  fill: string;
  tooltip: ReactNode;
  labelFormatter: (value: unknown) => string;
};

/** Shared scaffold for the three horizontal bar charts (issue #150). */
function HorizontalBarChart(props: HorizontalBarChartProps) {
  const { valueKey } = props;
  return (
    <ChartContainer
      config={hoursConfig}
      className={props.className}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={props.label}
    >
      <BarChart accessibilityLayer data={props.data} layout="vertical" margin={props.margin}>
        <XAxis type="number" dataKey={valueKey} hide />
        <YAxis
          type="category"
          dataKey={props.categoryKey}
          width={props.yAxisWidth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={props.categoryTickFormatter}
        />
        {props.tooltip}
        <Bar dataKey={valueKey} fill={props.fill} radius={4}>
          <LabelList
            dataKey={valueKey}
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={props.labelFormatter}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const truncateCategory = (v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v);

const topGamesTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent formatter={(v) => `${Number(v).toLocaleString()} lifetime hours`} />
    }
  />
);

/** Top games by lifetime hours — horizontal bars. */
export function TopGamesChart({ data }: { data: DashboardData }) {
  const rows = useMemo(() => topGamesByHours(data, 10), [data]);
  const label = chartLabel(
    "Top games by lifetime hours",
    rows.map((r) => `${r.name} ${r.hours.toLocaleString()} hours`)
  );
  return (
    <HorizontalBarChart
      label={label}
      className="aspect-auto h-[320px] w-full"
      data={rows}
      margin={{ left: 8, right: 32 }}
      valueKey="hours"
      categoryKey="name"
      yAxisWidth={150}
      categoryTickFormatter={truncateCategory}
      fill="var(--color-hours)"
      tooltip={topGamesTooltip}
      labelFormatter={(v) => `${Math.round(Number(v)).toLocaleString()}h`}
    />
  );
}

const genreTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        nameKey="genre"
        labelKey="genre"
        formatter={(v, _n, item) =>
          `${Number(v).toLocaleString()} lifetime hours · ${item.payload.share}%`
        }
      />
    }
  />
);

/**
 * Visually-hidden text equivalent for the donut: the genre-share data lives
 * nowhere else (the games table omits genre), so screen-reader users read it here.
 */
function GenreDataTable({ slices }: { slices: GenreSlice[] }) {
  return (
    <table className="sr-only">
      <caption>Genre share of lifetime hours</caption>
      <thead>
        <tr>
          <th scope="col">Genre</th>
          <th scope="col">Hours</th>
          <th scope="col">Share</th>
          <th scope="col">Games</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr key={s.genre}>
            <th scope="row">{s.genre}</th>
            <td>{s.hours.toLocaleString()}</td>
            <td>{s.share}%</td>
            <td>{s.games}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Genre split — donut. */
export function GenreChart({ data }: { data: DashboardData }) {
  const slices = useMemo(
    () => genreBreakdown(data).map((s, i) => ({ ...s, fill: chartColor(i) })),
    [data]
  );
  const config: ChartConfig = useMemo(
    () => Object.fromEntries(slices.map((s) => [s.genre, { label: s.genre, color: s.fill }])),
    [slices]
  );
  const label = chartLabel(
    "Genre share of lifetime hours",
    slices.map((s) => `${s.genre} ${s.hours.toLocaleString()} hours, ${s.share}%`)
  );
  return (
    <>
      <ChartContainer
        config={config}
        className="mx-auto aspect-square h-[300px]"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={label}
      >
        <PieChart>
          {genreTooltip}
          <Pie data={slices} dataKey="hours" nameKey="genre" innerRadius={70} strokeWidth={2}>
            {slices.map((s) => (
              <Cell key={s.genre} fill={s.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <GenreDataTable slices={slices} />
    </>
  );
}

const franchiseTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        nameKey="franchise"
        formatter={(v, _n, item) =>
          `${Number(v).toLocaleString()} lifetime hours · ${item.payload.games} games`
        }
      />
    }
  />
);

/** Top franchises by total hours — horizontal bars. */
export function FranchiseChart({ data }: { data: DashboardData }) {
  const rows = useMemo(() => topFranchises(data, 8), [data]);
  const label = chartLabel(
    "Top franchises by lifetime hours",
    rows.map((r) => `${r.franchise} ${r.hours.toLocaleString()} hours across ${r.games} games`)
  );
  return (
    <HorizontalBarChart
      label={label}
      className="aspect-auto h-[300px] w-full"
      data={rows}
      margin={{ left: 8, right: 32 }}
      valueKey="hours"
      categoryKey="franchise"
      yAxisWidth={120}
      fill="var(--chart-2)"
      tooltip={franchiseTooltip}
      labelFormatter={(v) => `${Math.round(Number(v)).toLocaleString()}h`}
    />
  );
}

const yearTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        labelFormatter={(l) => `Last played in ${l}`}
        formatter={(v, _n, item) =>
          `${Number(v).toLocaleString()} lifetime hours · ${item.payload.games} games`
        }
      />
    }
  />
);

/** Hours bucketed by most-recent-play year (a proxy, not a true timeline). */
export function YearChart({ data }: { data: DashboardData }) {
  const rows = useMemo(() => hoursByYear(data), [data]);
  const label = chartLabel(
    "Lifetime hours by most-recent-play year",
    rows.map((r) => `${r.year} ${r.hours.toLocaleString()} hours across ${r.games} games`)
  );
  return (
    <ChartContainer
      config={hoursConfig}
      className="aspect-auto h-[260px] w-full"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={label}
    >
      <AreaChart accessibilityLayer data={rows} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11 }} />
        {yearTooltip}
        <defs>
          <linearGradient id="fillYear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          dataKey="hours"
          type="monotone"
          stroke="var(--chart-1)"
          fill="url(#fillYear)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const sessionTooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        formatter={(v, _n, item) => `${Number(v)} h/session · ${item.payload.playCount} sessions`}
      />
    }
  />
);

/** Average session length per game — separates bingers from dip-in players. */
export function SessionChart({ data }: { data: DashboardData }) {
  const rows = useMemo(() => bingeVsDipIn(data, 12), [data]);
  const label = chartLabel(
    "Average session length per game",
    rows.map(
      (r) => `${r.name} ${r.hoursPerSession} hours per session across ${r.playCount} sessions`
    )
  );
  return (
    <HorizontalBarChart
      label={label}
      className="aspect-auto h-[340px] w-full"
      data={rows}
      margin={{ left: 8, right: 40 }}
      valueKey="hoursPerSession"
      categoryKey="name"
      yAxisWidth={150}
      categoryTickFormatter={truncateCategory}
      fill="var(--chart-4)"
      tooltip={sessionTooltip}
      labelFormatter={(v) => `${Number(v)}h`}
    />
  );
}
