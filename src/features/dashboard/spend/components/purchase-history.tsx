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
import { useState } from "react";
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
import type { TransactionRow } from "@/domain/transactions";
import { fmtDate, fmtNumber } from "@/features/dashboard/format";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useTransactionImport } from "@/stores/transactions-store";

/** Format a minor-unit amount as money, falling back to "£" when no symbol is known. */
function money(currency: string, minor: number): string {
  const symbol = currency || "£";
  return `${symbol}${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const TYPE_LABEL: Record<TransactionRow["kind"], string> = {
  purchase: "Purchase",
  "top-up": "Top-up",
};

const columns: Array<ColumnDef<TransactionRow>> = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <span className="text-muted-foreground">{fmtDate(row.original.date)}</span>,
    meta: { label: "Date" },
  },
  {
    accessorKey: "productName",
    header: "Product",
    cell: ({ row }) => (
      <span className="truncate" title={row.original.productName}>
        {row.original.productName}
      </span>
    ),
    meta: { label: "Product" },
  },
  {
    accessorKey: "amountMinor",
    header: "Amount paid",
    cell: ({ row }) => money(row.original.currency, row.original.amountMinor),
    meta: { numeric: true, label: "Amount paid" },
  },
  {
    id: "original",
    accessorFn: (row) => row.originalPriceMinor,
    header: "Original",
    // Lines with no original-price data sink to the bottom in both sort directions.
    sortUndefined: "last",
    cell: ({ row }) => {
      const { currency, originalPriceMinor } = row.original;
      if (originalPriceMinor === undefined) return "—";
      return <span className="text-muted-foreground">{money(currency, originalPriceMinor)}</span>;
    },
    meta: { numeric: true, label: "Original" },
  },
  {
    id: "discount",
    accessorFn: (row) => row.discountMinor,
    header: "Discount",
    // Lines with no discount data sink to the bottom in both sort directions.
    sortUndefined: "last",
    cell: ({ row }) => {
      const { currency, discountMinor } = row.original;
      if (!discountMinor) return "—";
      return <span className="text-foreground">−{money(currency, discountMinor)}</span>;
    },
    meta: { numeric: true, label: "Discount" },
  },
  {
    accessorKey: "kind",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline" className="shrink-0">
        {TYPE_LABEL[row.original.kind]}
      </Badge>
    ),
    meta: { label: "Type" },
  },
];

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) return null;
  return direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

function SortableHeader({ header }: { header: Header<TransactionRow, unknown> }) {
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

function PurchaseHistoryContent({ table }: { table: TableInstance<TransactionRow> }) {
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

// oxlint-disable-next-line react/react-compiler -- TanStack Table returns functions the compiler cannot safely memoise
function PurchaseHistoryTable({ transactions }: { transactions: TransactionRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

  const table = useReactTable({
    data: transactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: true,
    enableSortingRemoval: false,
    getRowId: (row) => row.key,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your purchase history</CardTitle>
        <CardDescription>
          Tap a column to sort. {fmtNumber(transactions.length)} imported transactions, newest
          first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px]">
          <PurchaseHistoryContent table={table} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard purchase-history section: the raw imported transactions as a
 * sortable table. Hidden for the demo dataset and until an import lands — the
 * spend section already prompts for the import.
 */
export function PurchaseHistorySection({ data }: { data: DashboardData }) {
  // Never show a real user's import alongside the demo library — call the hook
  // unconditionally, then hide for demo data or no import.
  const imported = useTransactionImport(data.profile.accountId);
  if (data.isDemo || !imported || imported.transactions.length === 0) return null;

  return <PurchaseHistoryTable transactions={imported.transactions} />;
}
