import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { TransactionRow } from "@/domain/transactions";
import {
  bingeVsDipIn,
  genreBreakdown,
  headlineTotals,
  hoursByYear,
  topFranchises,
  topGamesByHours,
} from "@/features/dashboard/filters/analytics";
import { fmtDate, fmtHours, fmtNumber } from "@/features/dashboard/format";
import { isAddOnPurchase, summariseAddOns, summariseSpend } from "@/features/dashboard/spend/spend";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { GamePoster } from "./poster";
import { prototypeTransactions } from "./prototype-data";

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-l border-[var(--playloom-rule)] py-2 pl-4 first:border-l-0 first:pl-0 max-sm:border-l-0 max-sm:border-t max-sm:py-3 max-sm:pl-0 max-sm:first:border-t-0">
      <span className="text-[0.625rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <strong className="overflow-hidden font-[Fraunces_Variable] text-[clamp(1.5rem,2.5vw,2.25rem)] font-semibold tracking-[-0.035em] tabular-nums">
        {value}
      </strong>
      <small className="text-[0.6875rem] text-muted-foreground">{detail}</small>
    </div>
  );
}

function OverviewArt({ game }: { game: GamePlay | undefined }) {
  if (!game) return null;
  return (
    <div className="grid grid-cols-[minmax(6.5rem,9rem)_minmax(0,1fr)] items-end gap-5">
      <div className="[&_.playloom-poster]:aspect-[2/3]">
        <GamePoster game={game} featured />
      </div>
      <div className="flex min-w-0 flex-col pb-2">
        <span className="text-[0.625rem] font-bold tracking-[0.12em] text-primary uppercase">
          Most played
        </span>
        <strong className="mt-2 font-[Fraunces_Variable] text-[clamp(1.5rem,3vw,2.5rem)] font-semibold tracking-[-0.035em] leading-none text-balance">
          {game.name}
        </strong>
        <small className="mt-3 text-muted-foreground tabular-nums">
          {fmtHours(game.hours)} across {fmtNumber(game.playCount)} launches
        </small>
      </div>
    </div>
  );
}

function OverviewMetrics({ data }: { data: DashboardData }) {
  const totals = headlineTotals(data);
  const hoursPerGame = totals.gamesPlayed === 0 ? 0 : totals.totalHours / totals.gamesPlayed;
  const hoursPerSession = totals.sessions === 0 ? 0 : totals.totalHours / totals.sessions;
  return (
    <div className="grid grid-cols-5 border-y border-[var(--playloom-rule)] py-2 max-sm:grid-cols-1">
      <Metric
        label="Lifetime play"
        value={fmtHours(totals.totalHours)}
        detail={`≈ ${fmtNumber(totals.days)} days non-stop`}
      />
      <Metric label="Games played" value={fmtNumber(totals.gamesPlayed)} detail="Distinct titles" />
      <Metric label="Sessions" value={fmtNumber(totals.sessions)} detail="Total launches" />
      <Metric label="Avg per game" value={fmtHours(hoursPerGame)} detail="Lifetime hours" />
      <Metric label="Avg session" value={fmtHours(hoursPerSession)} detail="Across all launches" />
    </div>
  );
}

export function ProfileOverview({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(30rem,1.3fr)] lg:items-end">
      <OverviewArt game={data.games[0]} />
      <div className="grid gap-3">
        <OverviewMetrics data={data} />
        <p className="max-w-[75ch] text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Lifetime-hours caveat.</strong> PSN reports lifetime
          hours per game. Time filters select games by last-played date; they do not turn lifetime
          hours into hours played during the period.
        </p>
      </div>
    </div>
  );
}

export function PlatinumShelf({ data }: { data: DashboardData }) {
  const games = data.games.filter((game) => (game.trophy?.earned.platinum ?? 0) > 0).slice(0, 8);
  if (games.length === 0) return null;
  return (
    <section className="mb-6 border-b border-border pb-6" aria-label="Platinum games">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <strong>Your platinum shelf</strong>
        <span className="text-xs text-muted-foreground">
          Most recently played first · exact trophy details follow below
        </span>
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-4">
        {games.map((game) => (
          <article className="grid min-w-0 gap-1.5" key={game.titleId}>
            <GamePoster game={game} />
            <strong className="truncate text-xs">{game.name}</strong>
            <span className="text-[10px] text-muted-foreground">
              {game.trophy?.progress ?? 100}% complete
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function gameForName(data: DashboardData, name: string): GamePlay {
  return data.games.find((game) => game.name === name) ?? data.games[0]!;
}

function RankedGame({
  data,
  name,
  hours,
  rank,
  featured,
}: {
  data: DashboardData;
  name: string;
  hours: number;
  rank: number;
  featured: boolean;
}) {
  const game = gameForName(data, name);
  const max = data.games[0]?.hours ?? hours;
  return (
    <article className={`playloom-ranked-game ${featured ? "is-featured" : ""}`}>
      <span className="playloom-rank">{String(rank).padStart(2, "0")}</span>
      <GamePoster game={game} featured={featured} />
      <div className="playloom-ranked-copy">
        <strong>{name}</strong>
        <span>
          {game.platform} · {fmtNumber(game.playCount)} launches
        </span>
        <div className="playloom-bar">
          <i style={{ width: `${Math.max(3, (hours / max) * 100)}%` }} />
        </div>
      </div>
      <b>{fmtHours(hours)}</b>
    </article>
  );
}

function TopGames({ data }: { data: DashboardData }) {
  return (
    <>
      <h4 className="playloom-subheading">Top games by hours</h4>
      <div className="playloom-ranked-list">
        {topGamesByHours(data, 10).map((row, index) => (
          <RankedGame key={row.name} data={data} {...row} rank={index + 1} featured={index === 0} />
        ))}
      </div>
    </>
  );
}

function Genres({ data }: { data: DashboardData }) {
  const rows = genreBreakdown(data);
  const max = rows[0]?.hours ?? 1;
  return (
    <div className="playloom-distribution">
      {rows.map((row) => (
        <div key={row.genre}>
          <strong>{row.genre}</strong>
          <div className="playloom-bar">
            <i style={{ width: `${(row.hours / max) * 100}%` }} />
          </div>
          <span>
            {fmtHours(row.hours)} · {row.share}% · {fmtNumber(row.games)} games
          </span>
        </div>
      ))}
    </div>
  );
}

function Franchises({ data }: { data: DashboardData }) {
  const rows = topFranchises(data, 8);
  return (
    <div className="playloom-franchises">
      {rows.map((row, index) => {
        const games = data.games.filter((game) => game.franchise === row.franchise).slice(0, 3);
        return (
          <article key={row.franchise}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div className="playloom-cover-stack">
              {games.map((game) => (
                <GamePoster key={game.titleId} game={game} />
              ))}
            </div>
            <strong>{row.franchise}</strong>
            <small>
              {fmtHours(row.hours)} · {fmtNumber(row.games)} games
            </small>
          </article>
        );
      })}
    </div>
  );
}

export function ProfileRanks({
  data,
  mode,
}: {
  data: DashboardData;
  mode: "games" | "genres" | "franchises";
}) {
  if (mode === "games") return <TopGames data={data} />;
  if (mode === "genres") return <Genres data={data} />;
  return <Franchises data={data} />;
}

function YearView({ data }: { data: DashboardData }) {
  const rows = hoursByYear(data);
  const max = Math.max(...rows.map((row) => row.hours), 1);
  return (
    <div className="playloom-year-view">
      {rows.map((row) => (
        <div key={row.year}>
          <span>{row.year}</span>
          <div>
            <i style={{ height: `${Math.max(5, (row.hours / max) * 100)}%` }} />
          </div>
          <strong>{fmtHours(row.hours)}</strong>
          <small>{fmtNumber(row.games)} games</small>
        </div>
      ))}
    </div>
  );
}

function SessionView({ data }: { data: DashboardData }) {
  const rows = bingeVsDipIn(data, 10);
  const max = rows[0]?.hoursPerSession ?? 1;
  return (
    <div className="playloom-session-view">
      {rows.map((row) => (
        <div key={row.name}>
          <strong>{row.name}</strong>
          <div className="playloom-bar">
            <i style={{ width: `${(row.hoursPerSession / max) * 100}%` }} />
          </div>
          <span>
            {row.hoursPerSession} h/session · {fmtNumber(row.playCount)} launches
          </span>
        </div>
      ))}
    </div>
  );
}

export function HistoryViews({ data }: { data: DashboardData }) {
  return (
    <>
      <section id="timeline" className="playloom-section" aria-labelledby="timeline-title">
        <h3 id="timeline-title">Timeline</h3>
        <YearView data={data} />
        <p className="playloom-caveat">
          Proxy view: each game’s complete lifetime hours sit in the year it was most recently
          played, because PSN does not provide historic hour totals.
        </p>
      </section>
      <section id="sessions" className="playloom-section" aria-labelledby="sessions-title">
        <h3 id="sessions-title">Sessions</h3>
        <SessionView data={data} />
      </section>
    </>
  );
}

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

function money(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

function LedgerRow({ row, data }: { row: TransactionRow; data: DashboardData }) {
  const original = row.originalPriceMinor === undefined ? "—" : money(row.originalPriceMinor);
  const discount = row.discountMinor ? `−${money(row.discountMinor)}` : "—";
  return (
    <tr>
      <td data-label="Date">{fmtDate(row.date)}</td>
      <td data-label="Product">{row.productName}</td>
      <td data-label="Type">{row.kind === "purchase" ? "Purchase" : "Top-up"}</td>
      <td data-label="Match">{matchesGame(row, data) ? "Matched" : "Unmatched"}</td>
      <td data-label="Original">{original}</td>
      <td data-label="Discount">{discount}</td>
      <td data-label="Paid">{money(row.amountMinor)}</td>
    </tr>
  );
}

type LedgerSort = "date" | "product" | "kind" | "match" | "original" | "discount" | "paid";

const ledgerColumns: ReadonlyArray<{ key: LedgerSort; label: string }> = [
  { key: "date", label: "Date" },
  { key: "product", label: "Product" },
  { key: "kind", label: "Type" },
  { key: "match", label: "Match" },
  { key: "original", label: "Original" },
  { key: "discount", label: "Discount" },
  { key: "paid", label: "Paid" },
];

const ledgerValue: Record<
  LedgerSort,
  (row: TransactionRow, data: DashboardData) => string | number
> = {
  date: (row) => row.date,
  product: (row) => row.productName,
  kind: (row) => row.kind,
  match: (row, data) => (matchesGame(row, data) ? 1 : 0),
  original: (row) => row.originalPriceMinor ?? -1,
  discount: (row) => row.discountMinor ?? 0,
  paid: (row) => row.amountMinor,
};

function compareLedger(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function sortLedgerRows(
  rows: TransactionRow[],
  data: DashboardData,
  sort: LedgerSort,
  descending: boolean
) {
  return rows.toSorted((left, right) => {
    const comparison = compareLedger(ledgerValue[sort](left, data), ledgerValue[sort](right, data));
    return descending ? -comparison : comparison;
  });
}

function Ledger({ rows, data }: { rows: TransactionRow[]; data: DashboardData }) {
  const [sort, setSort] = useState<LedgerSort>("date");
  const [descending, setDescending] = useState(true);
  const sorted = sortLedgerRows(rows, data, sort, descending);

  function changeSort(next: LedgerSort) {
    if (next === sort) {
      setDescending((value) => !value);
      return;
    }
    setSort(next);
    setDescending(next !== "product");
  }

  return (
    <section className="playloom-ledger" aria-label="Purchase history ledger">
      <table>
        <thead>
          <tr>
            {ledgerColumns.map((column) => (
              <th key={column.key}>
                <button type="button" onClick={() => changeSort(column.key)}>
                  {column.label} {sort === column.key ? (descending ? "↓" : "↑") : "↕"}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <LedgerRow key={row.key} row={row} data={data} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

type SpendSummary = ReturnType<typeof summariseSpend>;
type AddOnSummaries = ReturnType<typeof summariseAddOns>;

function SpendMetrics({ summary, discounts }: { summary: SpendSummary; discounts: number }) {
  return (
    <div className="playloom-metric-strip playloom-spend-strip">
      <Metric
        label="Total spend"
        value={`£${summary.totalSpend.toFixed(2)}`}
        detail={`${summary.purchaseCount} purchases`}
      />
      <Metric
        label="Matched spend"
        value={`£${(summary.totalSpend - summary.unmatchedSpend).toFixed(2)}`}
        detail={`${summary.paidGames} played titles`}
      />
      <Metric
        label="Unmatched"
        value={`£${summary.unmatchedSpend.toFixed(2)}`}
        detail="Subscriptions and unknowns"
      />
      <Metric
        label="Average paid"
        value={`£${(summary.totalSpend / summary.purchaseCount).toFixed(2)}`}
        detail="Per purchase line"
      />
      <Metric
        label="Discounts"
        value={`£${discounts.toFixed(2)}`}
        detail="Saved from original prices"
      />
    </div>
  );
}

function SpendYears({ summary }: { summary: SpendSummary }) {
  const max = Math.max(...summary.byYear.map((year) => year.spend), 1);
  return (
    <div className="playloom-spend-years">
      <h4>Spend by year</h4>
      {summary.byYear.map((year) => (
        <div key={year.year}>
          <span>{year.year}</span>
          <div className="playloom-bar">
            <i style={{ width: `${(year.spend / max) * 100}%` }} />
          </div>
          <strong>£{year.spend.toFixed(2)}</strong>
          <small>{year.purchases} purchases</small>
        </div>
      ))}
    </div>
  );
}

function SpendTitles({ data, summary }: { data: DashboardData; summary: SpendSummary }) {
  const max = Math.max(...summary.byTitle.map((title) => title.spend), 1);
  return (
    <div>
      <h4>Most spent</h4>
      {summary.byTitle.map((title) => {
        const game = data.games.find((candidate) => candidate.titleId === title.titleId);
        const rows = game
          ? prototypeTransactions.filter(
              (row) =>
                row.skuId?.includes(game.titleId) ||
                row.productName.toLowerCase().includes(game.name.toLowerCase())
            )
          : [];
        const addOns = rows
          .filter((row) => isAddOnPurchase(row, game))
          .reduce((total, row) => total + row.amountMinor / 100, 0);
        const base = title.spend - addOns;
        return (
          <div key={title.titleId} className="playloom-spend-title">
            {game && <GamePoster game={game} />}
            <span>
              <strong>{title.name}</strong>
              <small>
                Base £{base.toFixed(2)} · Add-ons £{addOns.toFixed(2)}
              </small>
              <div className="playloom-bar">
                <i style={{ width: `${(title.spend / max) * 100}%` }} />
              </div>
            </span>
            <b>£{title.spend.toFixed(2)}</b>
          </div>
        );
      })}
    </div>
  );
}

function SpendAddOns({ data, addOns }: { data: DashboardData; addOns: AddOnSummaries }) {
  return (
    <div>
      <h4>Add-ons</h4>
      {addOns.map((entry) => {
        const game = data.games.find((candidate) => candidate.titleId === entry.titleId);
        const label = entry.addOnCount === 1 ? "add-on" : "add-ons";
        return (
          <div key={entry.titleId} className="playloom-addon">
            {game && <GamePoster game={game} />}
            <span>
              <strong>{entry.name}</strong>
              <small>
                {entry.addOnCount} {label}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface TransactionFilterValues {
  query: string;
  purchasedAfter: string;
  kind: KindFilter;
  match: MatchFilter;
}

function transactionRows(data: DashboardData, filters: TransactionFilterValues) {
  return prototypeTransactions.filter((row) => {
    const matched = matchesGame(row, data);
    return (
      row.productName.toLowerCase().includes(filters.query.toLowerCase()) &&
      (filters.purchasedAfter === "" || row.date.slice(0, 10) >= filters.purchasedAfter) &&
      (filters.kind === "all" || row.kind === filters.kind) &&
      (filters.match === "all" || (filters.match === "matched") === matched)
    );
  });
}

function SpendingLedger({ data }: { data: DashboardData }) {
  const [query, setQuery] = useState("");
  const [purchasedAfter, setPurchasedAfter] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [match, setMatch] = useState<MatchFilter>("all");
  const filters = { query, purchasedAfter, kind, match };
  return (
    <div>
      <h4 className="playloom-subheading">Purchase history</h4>
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
      <Ledger rows={transactionRows(data, filters)} data={data} />
    </div>
  );
}

export function PrototypeSpending({ data }: { data: DashboardData }) {
  const summary = summariseSpend(data, prototypeTransactions);
  const discounts = prototypeTransactions.reduce(
    (total, row) => total + (row.discountMinor ?? 0) / 100,
    0
  );
  return (
    <div className="space-y-10">
      <SpendMetrics summary={summary} discounts={discounts} />
      <p className="playloom-spend-topups">
        Wallet top-ups: <strong>£{summary.topUpTotal.toFixed(2)}</strong> · shown separately from
        spend
      </p>
      <SpendYears summary={summary} />
      <SpendingLedger data={data} />
      <div className="playloom-spend-grid">
        <SpendTitles data={data} summary={summary} />
        <SpendAddOns data={data} addOns={summariseAddOns(data, prototypeTransactions)} />
      </div>
      <p className="playloom-caveat">
        Transactions are matched to played titles by stable SKU where available, then validated
        title matching. Unmatched spend stays visible rather than being guessed.
      </p>
    </div>
  );
}

type LibrarySort = "name" | "hours" | "playCount" | "firstPlayed" | "lastPlayed" | "trophies";

const libraryColumns: ReadonlyArray<{ key: LibrarySort; label: string }> = [
  { key: "name", label: "Game" },
  { key: "hours", label: "Lifetime hours" },
  { key: "playCount", label: "Sessions" },
  { key: "firstPlayed", label: "First played" },
  { key: "lastPlayed", label: "Last played" },
  { key: "trophies", label: "Trophies" },
];

function trophyProgress(game: GamePlay): number | undefined {
  return game.trophy?.progress;
}

type LibraryValue = string | number | undefined;
const libraryValue: Record<LibrarySort, (game: GamePlay) => LibraryValue> = {
  name: (game) => game.name,
  hours: (game) => game.hours,
  playCount: (game) => game.playCount,
  firstPlayed: (game) => game.firstPlayed,
  lastPlayed: (game) => game.lastPlayed,
  trophies: trophyProgress,
};

function compareLibraryValues(left: LibraryValue, right: LibraryValue): number {
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function sortGames(games: readonly GamePlay[], sort: LibrarySort, descending: boolean) {
  return games.toSorted((left, right) => {
    const comparison = compareLibraryValues(libraryValue[sort](left), libraryValue[sort](right));
    return descending ? -comparison : comparison;
  });
}

function LibraryHead({
  sort,
  descending,
  onSort,
}: {
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
}) {
  return (
    <thead>
      <tr>
        {libraryColumns.map((column) => (
          <th key={column.key}>
            <button type="button" onClick={() => onSort(column.key)}>
              {column.label}
              {sort === column.key && (descending ? <ArrowDown /> : <ArrowUp />)}
            </button>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function LibraryRow({ game }: { game: GamePlay }) {
  const trophies = trophyProgress(game);
  const trophyLabel = trophies === undefined ? "—" : `${trophies}%`;
  return (
    <tr>
      <td data-label="Game">
        <GamePoster game={game} />
        <span>
          <strong title={game.name}>{game.name}</strong>
          <small>{game.platform}</small>
        </span>
      </td>
      <td data-label="Lifetime hours">{fmtHours(game.hours)}</td>
      <td data-label="Sessions">{fmtNumber(game.playCount)}</td>
      <td data-label="First played">{fmtDate(game.firstPlayed)}</td>
      <td data-label="Last played">{fmtDate(game.lastPlayed)}</td>
      <td data-label="Trophies">{trophyLabel}</td>
    </tr>
  );
}

function LibraryTable({
  games,
  sort,
  descending,
  onSort,
}: {
  games: readonly GamePlay[];
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
}) {
  return (
    <div className="playloom-library-scroll">
      <table>
        <LibraryHead sort={sort} descending={descending} onSort={onSort} />
        <tbody>
          {games.map((game) => (
            <LibraryRow key={game.titleId} game={game} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrototypeLibrary({ data }: { data: DashboardData }) {
  const [sort, setSort] = useState<LibrarySort>("hours");
  const [descending, setDescending] = useState(true);

  function changeSort(next: LibrarySort) {
    if (next === sort) {
      setDescending((value) => !value);
      return;
    }
    setSort(next);
    setDescending(next !== "name");
  }

  return (
    <section className="playloom-library" aria-label="Every game you've played">
      <header>
        <strong>Every game you've played</strong>
        <span>
          {fmtNumber(data.meta.totalGames)} titles in total · tap a column to sort · lifetime PSN
          hours may under-report real play time
        </span>
      </header>
      <LibraryTable
        games={sortGames(data.games, sort, descending)}
        sort={sort}
        descending={descending}
        onSort={changeSort}
      />
    </section>
  );
}
