import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
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
import { SpendingSummary } from "@/features/dashboard/spend/components/spend";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { GamePoster } from "./poster";

function OverviewMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
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
      <GamePoster game={game} featured />
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
      <OverviewMetric
        label="Lifetime play"
        value={fmtHours(totals.totalHours)}
        detail={`≈ ${fmtNumber(totals.days)} days non-stop`}
      />
      <OverviewMetric
        label="Games played"
        value={fmtNumber(totals.gamesPlayed)}
        detail="Distinct titles"
      />
      <OverviewMetric label="Sessions" value={fmtNumber(totals.sessions)} detail="Total launches" />
      <OverviewMetric label="Avg per game" value={fmtHours(hoursPerGame)} detail="Lifetime hours" />
      <OverviewMetric
        label="Avg session"
        value={fmtHours(hoursPerSession)}
        detail="Across all launches"
      />
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
      <section
        id="timeline"
        className="playloom-section"
        aria-labelledby="timeline-title"
        tabIndex={-1}
      >
        <h3 id="timeline-title">Timeline</h3>
        <YearView data={data} />
        <p className="playloom-caveat">
          Proxy view: each game’s complete lifetime hours sit in the year it was most recently
          played, because PSN does not provide historic hour totals.
        </p>
      </section>
      <section
        id="sessions"
        className="playloom-section"
        aria-labelledby="sessions-title"
        tabIndex={-1}
      >
        <h3 id="sessions-title">Sessions</h3>
        <SessionView data={data} />
      </section>
    </>
  );
}

export function PrototypeSpending({
  data,
  transactions,
  unavailableMessage,
}: {
  data: DashboardData;
  transactions: TransactionRow[];
  unavailableMessage?: string;
}) {
  return (
    <SpendingSummary
      data={data}
      transactions={transactions}
      unavailableMessage={unavailableMessage}
    />
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
