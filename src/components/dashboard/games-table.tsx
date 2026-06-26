import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { gameRows } from "@/lib/psn/analytics";
import type { GameRow } from "@/lib/psn/analytics";
import type { DashboardData } from "@/lib/psn/types";
import { fmtDate, fmtHours, fmtNumber } from "./format";

type SortKey = "name" | "hours" | "playCount" | "lastPlayed" | "trophyProgress";

const columns: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: "name", label: "Game", numeric: false },
  { key: "hours", label: "Hours", numeric: true },
  { key: "playCount", label: "Sessions", numeric: true },
  { key: "lastPlayed", label: "Last played", numeric: true },
  { key: "trophyProgress", label: "Trophies", numeric: true },
];

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

interface HeaderCellProps {
  column: (typeof columns)[number];
  active: boolean;
  asc: boolean;
  onSort: (key: SortKey) => void;
}

function HeaderCell({ column, active, asc, onSort }: HeaderCellProps) {
  return (
    <th className={`py-2 font-medium ${column.numeric ? "text-right" : "text-left"}`}>
      <button
        type="button"
        aria-label={`Sort by ${column.label}`}
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          column.numeric ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {column.label}
        <SortIcon active={active} asc={asc} />
      </button>
    </th>
  );
}

function compare(a: GameRow, b: GameRow, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

function GameRowItem({ row }: { row: GameRow }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">
            {row.platform}
          </Badge>
          <span className="truncate" title={row.name}>
            {row.name}
          </span>
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">{fmtHours(row.hours)}</td>
      <td className="py-2 text-right tabular-nums">{fmtNumber(row.playCount)}</td>
      <td className="py-2 text-right tabular-nums text-muted-foreground">
        {fmtDate(row.lastPlayed)}
      </td>
      <td className="py-2 text-right tabular-nums">
        {row.trophyProgress === undefined ? "—" : `${row.trophyProgress}%`}
      </td>
    </tr>
  );
}

interface TableViewProps {
  rows: GameRow[];
  sortKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}

function GamesTableView({ rows, sortKey, asc, onSort }: TableViewProps) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 bg-card">
        <tr className="border-b text-muted-foreground">
          {columns.map((c) => (
            <HeaderCell
              key={c.key}
              column={c}
              active={sortKey === c.key}
              asc={asc}
              onSort={onSort}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <GameRowItem key={r.titleId} row={r} />
        ))}
      </tbody>
    </table>
  );
}

export function GamesTable({ data }: { data: DashboardData }) {
  const [sortKey, setSortKey] = useState<SortKey>("hours");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const sorted = gameRows(data).sort((a, b) => compare(a, b, sortKey));
    return asc ? sorted : sorted.reverse();
  }, [data, sortKey, asc]);

  function toggle(key: SortKey) {
    setSortKey(key);
    setAsc((prev) => (key === sortKey ? !prev : false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Every game you've played</CardTitle>
        <CardDescription>
          Tap a column to sort. {fmtNumber(data.meta.totalGames)} titles in total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px]">
          <GamesTableView rows={rows} sortKey={sortKey} asc={asc} onSort={toggle} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
