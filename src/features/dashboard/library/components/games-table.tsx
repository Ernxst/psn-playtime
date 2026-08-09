import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtHours, fmtNumber } from "@/features/dashboard/format";
import { GamePoster } from "@/features/prototype/poster";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";

const librarySorts = [
  "name",
  "hours",
  "playCount",
  "firstPlayed",
  "lastPlayed",
  "trophies",
] as const;

type LibrarySort = (typeof librarySorts)[number];

interface SortDetails {
  label: string;
  statusLabel: string;
  defaultDescending: boolean;
  ascendingLabel: string;
  descendingLabel: string;
}

const sortDetails: Record<LibrarySort, SortDetails> = {
  name: {
    label: "Game",
    statusLabel: "game name",
    defaultDescending: false,
    ascendingLabel: "A to Z",
    descendingLabel: "Z to A",
  },
  hours: {
    label: "Lifetime hours",
    statusLabel: "lifetime hours",
    defaultDescending: true,
    ascendingLabel: "fewest hours first",
    descendingLabel: "most hours first",
  },
  playCount: {
    label: "Sessions",
    statusLabel: "sessions",
    defaultDescending: true,
    ascendingLabel: "fewest sessions first",
    descendingLabel: "most sessions first",
  },
  firstPlayed: {
    label: "First played",
    statusLabel: "first played",
    defaultDescending: true,
    ascendingLabel: "oldest first",
    descendingLabel: "newest first",
  },
  lastPlayed: {
    label: "Last played",
    statusLabel: "last played",
    defaultDescending: true,
    ascendingLabel: "oldest first",
    descendingLabel: "newest first",
  },
  trophies: {
    label: "Trophies",
    statusLabel: "trophy progress",
    defaultDescending: true,
    ascendingLabel: "lowest progress first",
    descendingLabel: "highest progress first",
  },
};

type LibraryValue = string | number | undefined;

const libraryValue: Record<LibrarySort, (game: GamePlay) => LibraryValue> = {
  name: (game) => game.name,
  hours: (game) => game.hours,
  playCount: (game) => game.playCount,
  firstPlayed: (game) => game.firstPlayed,
  lastPlayed: (game) => game.lastPlayed,
  trophies: (game) => game.trophy?.progress,
};

function compareLibraryValues(left: LibraryValue, right: LibraryValue): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function sortGames(games: readonly GamePlay[], sort: LibrarySort, descending: boolean) {
  return games.toSorted((left, right) => {
    const leftValue = libraryValue[sort](left);
    const rightValue = libraryValue[sort](right);
    if (leftValue === undefined || rightValue === undefined) {
      return compareLibraryValues(leftValue, rightValue);
    }
    const comparison = compareLibraryValues(leftValue, rightValue);
    return descending ? -comparison : comparison;
  });
}

function directionLabel(sort: LibrarySort, descending: boolean): string {
  const details = sortDetails[sort];
  return descending ? details.descendingLabel : details.ascendingLabel;
}

function SortIcon({ active = true, descending }: { active?: boolean; descending: boolean }) {
  if (!active) {
    return <ArrowUpDown className="size-3.5 opacity-45" aria-hidden="true" />;
  }
  const Icon = descending ? ArrowDown : ArrowUp;
  return <Icon className="size-3.5" aria-hidden="true" />;
}

function GameIdentity({ game }: { game: GamePlay }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="w-12 shrink-0 [&_.playloom-poster]:w-full [&_.playloom-poster]:shadow-none [&_.playloom-poster]:outline [&_.playloom-poster]:outline-1 [&_.playloom-poster]:-outline-offset-1 [&_.playloom-poster]:outline-black/10 dark:[&_.playloom-poster]:outline-white/10">
        <GamePoster game={game} />
      </div>
      <span className="grid min-w-0 gap-1">
        <strong className="break-words text-[0.8125rem] leading-snug text-pretty">
          {game.name}
        </strong>
        <small className="text-xs text-muted-foreground">{game.platform}</small>
      </span>
    </div>
  );
}

function activeAriaSort(
  active: boolean,
  descending: boolean
): "ascending" | "descending" | undefined {
  if (!active) return undefined;
  return descending ? "descending" : "ascending";
}

function DesktopHeaderCell({
  column,
  sort,
  descending,
  onSort,
}: {
  column: LibrarySort;
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
}) {
  const details = sortDetails[column];
  const active = column === sort;
  const alignment = column === "name" ? "justify-start text-start" : "justify-end text-end";
  const width = column === "name" ? "w-[34%]" : "";
  return (
    <th
      className={`border-t border-[var(--playloom-rule)] p-0 ${width}`}
      scope="col"
      aria-sort={activeAriaSort(active, descending)}
    >
      <button
        type="button"
        className={`flex min-h-11 w-full items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap text-muted-foreground outline-none hover:bg-foreground/4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${alignment} ${active ? "bg-foreground/[0.045] text-foreground" : ""}`}
        aria-label={`Sort by ${details.label}`}
        onClick={() => onSort(column)}
      >
        {details.label}
        <SortIcon active={active} descending={descending} />
      </button>
    </th>
  );
}

function DesktopHeader({
  sort,
  descending,
  onSort,
}: {
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
}) {
  return (
    <thead className="sticky top-0 z-10 bg-[var(--playloom-paper-raised)]">
      <tr>
        {librarySorts.map((column) => (
          <DesktopHeaderCell
            key={column}
            column={column}
            sort={sort}
            descending={descending}
            onSort={onSort}
          />
        ))}
      </tr>
    </thead>
  );
}

const numericCell =
  "border-t border-[var(--playloom-rule)] px-3 py-2.5 text-end align-middle text-[0.8125rem] leading-5 whitespace-nowrap tabular-nums";

function DesktopGameRow({ game }: { game: GamePlay }) {
  const trophies = game.trophy?.progress;
  return (
    <tr>
      <td className="border-t border-[var(--playloom-rule)] px-3 py-2.5 align-middle">
        <GameIdentity game={game} />
      </td>
      <td className={numericCell}>{fmtHours(game.hours)}</td>
      <td className={numericCell}>{fmtNumber(game.playCount)}</td>
      <td className={numericCell}>{fmtDate(game.firstPlayed)}</td>
      <td className={numericCell}>{fmtDate(game.lastPlayed)}</td>
      <td className={numericCell}>{trophies === undefined ? "—" : `${trophies}%`}</td>
    </tr>
  );
}

function DesktopLibrary({
  games,
  sort,
  descending,
  onSort,
  regionLabel,
}: {
  games: readonly GamePlay[];
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
  regionLabel: string;
}) {
  return (
    <section
      className="hidden max-h-[min(37.5rem,70dvh)] overflow-y-auto overscroll-y-contain border-b border-[var(--playloom-rule)] xl:block"
      aria-label={regionLabel}
    >
      <table className="w-full border-collapse">
        <DesktopHeader sort={sort} descending={descending} onSort={onSort} />
        <tbody>
          {games.map((game) => (
            <DesktopGameRow key={game.titleId} game={game} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function GameDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="break-words text-sm leading-5 tabular-nums">{value}</dd>
    </div>
  );
}

function MobileGame({ game }: { game: GamePlay }) {
  const titleId = `library-game-${game.titleId}`;
  const trophies = game.trophy?.progress;
  return (
    <article className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5" aria-labelledby={titleId}>
      <div className="w-18 shrink-0 [&_.playloom-poster]:w-full [&_.playloom-poster]:shadow-none [&_.playloom-poster]:outline [&_.playloom-poster]:outline-1 [&_.playloom-poster]:-outline-offset-1 [&_.playloom-poster]:outline-black/10 dark:[&_.playloom-poster]:outline-white/10">
        <GamePoster game={game} />
      </div>
      <div className="min-w-0">
        <strong
          id={titleId}
          className="block break-words text-[0.9375rem] leading-snug text-pretty"
        >
          {game.name}
        </strong>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 sm:gap-x-6">
          <GameDatum label="Platform" value={game.platform} />
          <GameDatum label="Lifetime hours" value={fmtHours(game.hours)} />
          <GameDatum label="Sessions" value={fmtNumber(game.playCount)} />
          <GameDatum label="First played" value={fmtDate(game.firstPlayed)} />
          <GameDatum label="Last played" value={fmtDate(game.lastPlayed)} />
          <GameDatum label="Trophies" value={trophies === undefined ? "—" : `${trophies}%`} />
        </dl>
      </div>
    </article>
  );
}

function MobileLibrary({
  games,
  regionLabel,
}: {
  games: readonly GamePlay[];
  regionLabel: string;
}) {
  return (
    <section
      className="max-h-[min(37.5rem,70dvh)] overflow-y-auto overscroll-y-contain xl:hidden"
      aria-label={regionLabel}
    >
      <ol className="divide-y divide-[var(--playloom-rule)] border-y border-[var(--playloom-rule)]">
        {games.map((game) => (
          <li key={game.titleId}>
            <MobileGame game={game} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function MobileSortSelect({
  sort,
  onSort,
}: {
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-bold" htmlFor="library-sort">
      Sort games by
      <select
        id="library-sort"
        name="library-sort"
        className="min-h-11 w-full touch-manipulation rounded-[2px] border border-[var(--playloom-rule)] bg-background px-3 text-base font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        value={sort}
        onChange={(event) => {
          const next = librarySorts.find((key) => key === event.currentTarget.value) ?? "hours";
          onSort(next);
        }}
      >
        {librarySorts.map((key) => (
          <option key={key} value={key}>
            {sortDetails[key].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MobileSortControls({
  sort,
  descending,
  onSort,
  onDirection,
}: {
  sort: LibrarySort;
  descending: boolean;
  onSort: (sort: LibrarySort) => void;
  onDirection: () => void;
}) {
  const currentDirection = directionLabel(sort, descending);
  return (
    <div className="grid grid-cols-1 gap-2 bg-[var(--playloom-paper-raised)] p-3 min-[23rem]:grid-cols-[minmax(0,1fr)_minmax(8.5rem,auto)] min-[23rem]:items-end xl:hidden">
      <MobileSortSelect sort={sort} onSort={onSort} />
      <Button
        className="min-h-11 w-full touch-manipulation justify-between rounded-[2px] border-[var(--playloom-rule)] bg-background px-3 text-sm shadow-none before:rounded-[1px] before:shadow-none hover:bg-foreground/4"
        variant="outline"
        aria-label={`Reverse sort order. Currently ${currentDirection}.`}
        onClick={onDirection}
      >
        <span className="first-letter:uppercase">{currentDirection}</span>
        <SortIcon descending={descending} />
      </Button>
    </div>
  );
}

function EmptyLibrary({
  unfilteredTotal,
  onClearFilters,
}: {
  unfilteredTotal: number;
  onClearFilters: (() => void) | undefined;
}) {
  const filtered = unfilteredTotal > 0;
  return (
    <div
      className="grid justify-items-start gap-3 border-t border-[var(--playloom-rule)] px-3 py-8"
      aria-labelledby="library-empty-title"
    >
      <h4
        id="library-empty-title"
        className="font-[Fraunces_Variable] text-xl font-semibold tracking-[-0.02em] text-balance"
      >
        {filtered ? "No matching games in Library" : "No games in this archive"}
      </h4>
      <p className="max-w-[65ch] text-sm leading-relaxed text-pretty text-muted-foreground">
        {filtered
          ? `${fmtNumber(unfilteredTotal)} games remain in the archive. Clear the active game filters to show them here.`
          : "Connect PlayStation or restore an archive to add games to Library."}
      </p>
      {filtered && onClearFilters && (
        <Button
          className="min-h-11 rounded-[2px] border-[var(--playloom-ink)] bg-transparent px-4 shadow-none before:rounded-[1px] before:shadow-none hover:bg-foreground/4"
          variant="outline"
          onClick={onClearFilters}
        >
          Clear game filters
        </Button>
      )}
    </div>
  );
}

function LibraryHeader({
  countSummary,
  status,
}: {
  countSummary: string;
  status: string | undefined;
}) {
  return (
    <header className="flex flex-col gap-3 py-4 xl:flex-row xl:items-end xl:justify-between xl:px-3">
      <div className="grid gap-1.5">
        <h4 id="library-table-title" className="text-base leading-snug font-semibold text-balance">
          Every game you've played
        </h4>
        <p className="max-w-[75ch] text-[0.8125rem] leading-5 text-pretty text-muted-foreground">
          {countSummary} Lifetime PSN hours may under-report real play time.
        </p>
      </div>
      <output className="min-h-5 text-xs text-muted-foreground" aria-live="polite" aria-atomic>
        {status}
      </output>
    </header>
  );
}

interface LibraryContentProps {
  games: readonly GamePlay[];
  sort: LibrarySort;
  descending: boolean;
  regionLabel: string;
  unfilteredTotal: number;
  onSort: (sort: LibrarySort) => void;
  onDirection: () => void;
  onClearFilters: (() => void) | undefined;
}

function LibraryContent({
  games,
  sort,
  descending,
  regionLabel,
  unfilteredTotal,
  onSort,
  onDirection,
  onClearFilters,
}: LibraryContentProps) {
  if (games.length === 0) {
    return <EmptyLibrary unfilteredTotal={unfilteredTotal} onClearFilters={onClearFilters} />;
  }
  return (
    <>
      <MobileSortControls
        sort={sort}
        descending={descending}
        onSort={onSort}
        onDirection={onDirection}
      />
      <DesktopLibrary
        games={games}
        sort={sort}
        descending={descending}
        onSort={onSort}
        regionLabel={regionLabel}
      />
      <MobileLibrary games={games} regionLabel={regionLabel} />
    </>
  );
}

function useLibrarySort(games: readonly GamePlay[]) {
  const [sort, setSort] = useState<LibrarySort>("hours");
  const [descending, setDescending] = useState(true);
  const sortedGames = useMemo(() => sortGames(games, sort, descending), [games, sort, descending]);

  function changeSort(next: LibrarySort) {
    if (next === sort) {
      setDescending((value) => !value);
      return;
    }
    setSort(next);
    setDescending(sortDetails[next].defaultDescending);
  }

  return {
    sort,
    descending,
    games: sortedGames,
    changeSort,
    reverseSort: () => setDescending((value) => !value),
  };
}

interface GamesTableProps {
  data: DashboardData;
  unfilteredTotal?: number;
  onClearFilters?: () => void;
}

// oxlint-disable-next-line complexity/complexity -- count copy belongs with the table it describes
export function GamesTable({
  data,
  unfilteredTotal = data.meta.totalGames,
  onClearFilters,
}: GamesTableProps) {
  const { sort, descending, games, changeSort, reverseSort } = useLibrarySort(data.games);
  const details = sortDetails[sort];
  const currentDirection = directionLabel(sort, descending);
  const titleCount = data.meta.totalGames;
  const gameLabel = titleCount === 1 ? "game" : "games";
  const titleLabel = unfilteredTotal === 1 ? "title" : "titles";
  const filtered = titleCount < unfilteredTotal;
  const countSummary = filtered
    ? `Showing ${fmtNumber(titleCount)} of ${fmtNumber(unfilteredTotal)} ${titleLabel} matching the active game filters.`
    : `${fmtNumber(unfilteredTotal)} ${titleLabel} in total.`;
  const regionLabel = filtered
    ? `${fmtNumber(titleCount)} matching ${gameLabel} in the Library out of ${fmtNumber(unfilteredTotal)} ${titleLabel}`
    : `${fmtNumber(titleCount)} ${gameLabel} in the Library`;
  const status =
    titleCount > 0 ? `Sorted by ${details.statusLabel}, ${currentDirection}` : undefined;

  return (
    <section
      className="border-t border-[var(--playloom-ink)]"
      aria-labelledby="library-table-title"
    >
      <LibraryHeader countSummary={countSummary} status={status} />
      <LibraryContent
        games={games}
        sort={sort}
        descending={descending}
        regionLabel={regionLabel}
        unfilteredTotal={unfilteredTotal}
        onSort={changeSort}
        onDirection={reverseSort}
        onClearFilters={onClearFilters}
      />
    </section>
  );
}
