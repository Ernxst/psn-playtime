import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Header,
  type SortingState,
  type Table as TableInstance,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gameRows } from "@/features/dashboard/analytics";
import type { GameRow } from "@/features/dashboard/analytics";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { fmtDate, fmtHours, fmtNumber } from "../format";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends unknown, TValue> {
    numeric?: boolean;
    label?: string;
  }
}

const columns: Array<ColumnDef<GameRow>> = [
  {
    accessorKey: "name",
    header: "Game",
    meta: { label: "Game" },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="shrink-0">
          {row.original.platform}
        </Badge>
        <span className="truncate" title={row.original.name}>
          {row.original.name}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "hours",
    header: "Lifetime hours",
    cell: ({ row }) => fmtHours(row.original.hours),
    meta: { numeric: true, label: "Lifetime hours" },
  },
  {
    accessorKey: "playCount",
    header: "Sessions",
    cell: ({ row }) => fmtNumber(row.original.playCount),
    meta: { numeric: true, label: "Sessions" },
  },
  {
    accessorKey: "lastPlayed",
    header: "Last played",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{fmtDate(row.original.lastPlayed)}</span>
    ),
    meta: { numeric: true, label: "Last played" },
  },
  {
    accessorKey: "trophyProgress",
    header: "Trophies",
    // Keep "—" (no trophy data) rows at the bottom in both sort directions.
    sortUndefined: "last",
    cell: ({ row }) =>
      row.original.trophyProgress === undefined ? "—" : `${row.original.trophyProgress}%`,
    meta: { numeric: true, label: "Trophies" },
  },
];

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) return null;
  return direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

function SortableHeader({ header }: { header: Header<GameRow, unknown> }) {
  // TanStack Table returns a stable instance and mutates it in place, so the
  // React Compiler would memoise this away and freeze the sort UI. Opt out so
  // header state (sort direction/icon) re-renders when the user sorts.
  "use no memo";
  const meta = header.column.columnDef.meta;
  const numeric = meta?.numeric;
  const sorted = header.column.getIsSorted();
  return (
    <TableHead className={numeric ? "text-right" : "text-left"}>
      <button
        type="button"
        aria-label={`Sort by ${meta?.label ?? ""}`}
        onClick={header.column.getToggleSortingHandler()}
        className={`hit-area-y-2 inline-flex items-center gap-1 hover:text-foreground ${
          numeric ? "flex-row-reverse" : ""
        } ${sorted ? "text-foreground" : ""}`}
      >
        {flexRender(header.column.columnDef.header, header.getContext())}
        <SortIcon direction={sorted} />
      </button>
    </TableHead>
  );
}

function GamesTableContent({ table }: { table: TableInstance<GameRow> }) {
  // See SortableHeader: the table instance is stable+mutable, so opt this
  // subtree out of the React Compiler or sorted rows never re-render.
  "use no memo";
  return (
    <Table className="text-sm">
      <TableHeader className="sticky top-0 z-10 bg-card">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="text-muted-foreground">
            {headerGroup.headers.map((header) => (
              <SortableHeader key={header.id} header={header} />
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cell.column.columnDef.meta?.numeric ? "text-right tabular-nums" : ""}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function GamesTable({ data }: { data: DashboardData }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "hours", desc: true }]);

  const rows = useMemo(() => gameRows(data), [data]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: true,
    enableSortingRemoval: false,
    getRowId: (row) => row.titleId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Every game you've played</CardTitle>
        <CardDescription>
          Tap a column to sort. {fmtNumber(data.meta.totalGames)} titles in total. Hours are what
          PSN recorded for each game and can under-report real play time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px]">
          <GamesTableContent table={table} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
