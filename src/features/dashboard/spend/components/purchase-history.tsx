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
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type MatchFilter = "all" | "matched" | "unmatched";
type KindFilter = "all" | TransactionRow["kind"];

function matchesGame(transaction: TransactionRow, data: DashboardData): boolean {
  const product = transaction.productName.toLowerCase();
  return data.games.some(
    (game) => product.includes(game.name.toLowerCase()) || transaction.skuId?.includes(game.titleId)
  );
}

function PurchaseSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="playloom-purchase-search">
      <Search />
      <Input
        aria-label="Search products"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Search products"
      />
    </div>
  );
}

function kindFilter(value: string): KindFilter {
  if (value === "purchase" || value === "top-up") return value;
  return "all";
}

function matchFilter(value: string): MatchFilter {
  if (value === "matched" || value === "unmatched") return value;
  return "all";
}

function KindSelect({
  value,
  onChange,
}: {
  value: KindFilter;
  onChange: (value: KindFilter) => void;
}) {
  return (
    <label>
      Type
      <select value={value} onChange={(event) => onChange(kindFilter(event.currentTarget.value))}>
        <option value="all">All</option>
        <option value="purchase">Purchases</option>
        <option value="top-up">Top-ups</option>
      </select>
    </label>
  );
}

function MatchSelect({
  value,
  onChange,
}: {
  value: MatchFilter;
  onChange: (value: MatchFilter) => void;
}) {
  return (
    <label>
      Match
      <select value={value} onChange={(event) => onChange(matchFilter(event.currentTarget.value))}>
        <option value="all">All</option>
        <option value="matched">Matched</option>
        <option value="unmatched">Unmatched</option>
      </select>
    </label>
  );
}

function TransactionFilters({
  query,
  onQuery,
  purchasedAfter,
  onPurchasedAfter,
  kind,
  onKind,
  match,
  onMatch,
}: {
  query: string;
  onQuery: (value: string) => void;
  purchasedAfter: string;
  onPurchasedAfter: (value: string) => void;
  kind: KindFilter;
  onKind: (value: KindFilter) => void;
  match: MatchFilter;
  onMatch: (value: MatchFilter) => void;
}) {
  return (
    <div className="playloom-transaction-filters">
      <div>
        <strong>Purchase filters</strong>
        <span>Applies only to Spending</span>
      </div>
      <PurchaseSearch value={query} onChange={onQuery} />
      <label>
        Purchased from
        <input
          type="date"
          aria-label="Purchase date from"
          value={purchasedAfter}
          onChange={(event) => onPurchasedAfter(event.currentTarget.value)}
        />
      </label>
      <KindSelect value={kind} onChange={onKind} />
      <MatchSelect value={match} onChange={onMatch} />
    </div>
  );
}

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

function matchColumn(data: DashboardData): ColumnDef<TransactionRow> {
  return {
    id: "match",
    accessorFn: (row) => matchesGame(row, data),
    header: "Match",
    cell: ({ row }) => (matchesGame(row.original, data) ? "Matched" : "Unmatched"),
    meta: { label: "Match" },
  };
}

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
function PurchaseHistoryTable({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions: TransactionRow[];
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

  const table = useReactTable({
    data: transactions,
    columns: [...columns, matchColumn(data)],
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

interface TransactionFilterValues {
  query: string;
  purchasedAfter: string;
  kind: KindFilter;
  match: MatchFilter;
}

function transactionRows(
  data: DashboardData,
  transactions: TransactionRow[],
  filters: TransactionFilterValues
) {
  return transactions.filter((row) => {
    const matched = matchesGame(row, data);
    return (
      row.productName.toLowerCase().includes(filters.query.toLowerCase()) &&
      (filters.purchasedAfter === "" || row.date.slice(0, 10) >= filters.purchasedAfter) &&
      (filters.kind === "all" || row.kind === filters.kind) &&
      (filters.match === "all" || (filters.match === "matched") === matched)
    );
  });
}

function FilteredPurchaseHistory({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions: TransactionRow[];
}) {
  const [query, setQuery] = useState("");
  const [purchasedAfter, setPurchasedAfter] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [match, setMatch] = useState<MatchFilter>("all");
  const filters = { query, purchasedAfter, kind, match };
  return (
    <div>
      <TransactionFilters
        query={query}
        onQuery={setQuery}
        purchasedAfter={purchasedAfter}
        onPurchasedAfter={setPurchasedAfter}
        kind={kind}
        onKind={setKind}
        match={match}
        onMatch={setMatch}
      />
      <PurchaseHistoryTable
        data={data}
        transactions={transactionRows(data, transactions, filters)}
      />
    </div>
  );
}

/**
 * Dashboard purchase-history section: the raw imported transactions as a
 * sortable table. Accounts without transactions receive an explicit empty
 * state so the direct destination remains useful.
 */
export function PurchaseHistorySection({
  data,
  transactions,
}: {
  data: DashboardData;
  transactions?: TransactionRow[];
}) {
  const imported = useTransactionImport(data.profile.accountId);
  const rows = transactions ?? imported?.transactions ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No purchase history yet</CardTitle>
          <CardDescription>
            Import purchase transactions to show dated purchase rows here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <FilteredPurchaseHistory data={data} transactions={rows} />;
}
