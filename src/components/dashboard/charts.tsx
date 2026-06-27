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
  hoursByYear,
  topFranchises,
  topGamesByHours,
} from "@/lib/psn/analytics";
import type { DashboardData } from "@/lib/psn/types";
import { chartColor } from "./format";

const hoursConfig = {
  hours: { label: "Hours", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Top games by lifetime hours — horizontal bars. */
export function TopGamesChart({ data }: { data: DashboardData }) {
  const rows = topGamesByHours(data, 10);
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-[320px] w-full">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 32 }}>
        <XAxis type="number" dataKey="hours" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v) => `${Number(v).toLocaleString()} lifetime hours`}
            />
          }
        />
        <Bar dataKey="hours" fill="var(--color-hours)" radius={4}>
          <LabelList
            dataKey="hours"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => `${Math.round(Number(v)).toLocaleString()}h`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Genre split — donut. */
export function GenreChart({ data }: { data: DashboardData }) {
  const slices = genreBreakdown(data).map((s, i) => ({ ...s, fill: chartColor(i) }));
  const config: ChartConfig = Object.fromEntries(
    slices.map((s) => [s.genre, { label: s.genre, color: s.fill }])
  );
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[300px]">
      <PieChart>
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
        <Pie data={slices} dataKey="hours" nameKey="genre" innerRadius={70} strokeWidth={2}>
          {slices.map((s) => (
            <Cell key={s.genre} fill={s.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** Top franchises by total hours — horizontal bars. */
export function FranchiseChart({ data }: { data: DashboardData }) {
  const rows = topFranchises(data, 8);
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-[300px] w-full">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 32 }}>
        <XAxis type="number" dataKey="hours" hide />
        <YAxis
          type="category"
          dataKey="franchise"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
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
        <Bar dataKey="hours" fill="var(--chart-2)" radius={4}>
          <LabelList
            dataKey="hours"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => `${Math.round(Number(v)).toLocaleString()}h`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Hours bucketed by most-recent-play year (a proxy, not a true timeline). */
export function YearChart({ data }: { data: DashboardData }) {
  const rows = hoursByYear(data);
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart accessibilityLayer data={rows} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11 }} />
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

/** Average session length per game — separates bingers from dip-in players. */
export function SessionChart({ data }: { data: DashboardData }) {
  const rows = bingeVsDipIn(data, 12);
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-[340px] w-full">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
        <XAxis type="number" dataKey="hoursPerSession" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v, _n, item) =>
                `${Number(v)} h/session · ${item.payload.playCount} sessions`
              }
            />
          }
        />
        <Bar dataKey="hoursPerSession" fill="var(--chart-4)" radius={4}>
          <LabelList
            dataKey="hoursPerSession"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => `${Number(v)}h`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
