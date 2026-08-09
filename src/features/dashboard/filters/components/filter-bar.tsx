import { SlidersHorizontal, X } from "lucide-react";
import { type RefObject, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  type Activity,
  type DashboardFilters,
  defaultFilters,
} from "@/features/dashboard/filters/analytics";
import type { DashboardData, GamePlay, Genre, Platform } from "@/server/providers/account/snapshot";

type Setter = (patch: Partial<DashboardFilters>) => void;

interface FacetOptions {
  genres: Genre[];
  franchises: string[];
  platforms: Platform[];
  maxHours: number;
  maxSessions: number;
  hasTrophies: boolean;
}

function facetOptions(data: DashboardData): FacetOptions {
  return {
    genres: [...new Set(data.games.map((game) => game.genre))].toSorted(),
    platforms: [...new Set(data.games.map((game) => game.platform))].toSorted(),
    franchises: [
      ...new Set(data.games.flatMap((game) => (game.franchise ? [game.franchise] : []))),
    ].toSorted(),
    maxHours: Math.ceil(Math.max(0, ...data.games.map((game) => game.hours))),
    maxSessions: Math.max(0, ...data.games.map((game) => game.playCount)),
    hasTrophies: data.games.some((game: GamePlay) => game.trophy !== undefined),
  };
}

const ACTIVITIES: ReadonlyArray<{ value: Activity; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "dormant", label: "Dormant" },
];

function countActiveFilters(filters: DashboardFilters): number {
  return [
    filters.timeframe !== "all",
    filters.search.trim() !== "",
    filters.genres.length > 0,
    filters.franchises.length > 0,
    filters.platforms.length > 0,
    filters.lastPlayedFrom !== undefined,
    filters.lastPlayedTo !== undefined,
    filters.minHours !== undefined,
    filters.maxHours !== undefined,
    filters.minSessions !== undefined,
    filters.hasPlatinum,
    filters.minTrophyProgress !== undefined,
    filters.activity !== "all",
  ].filter(Boolean).length;
}

function resultSummary(count: number): string {
  return `${count} ${count === 1 ? "game" : "games"} shown`;
}

function activeFilterSummary(count: number): string {
  if (count === 0) return "No filters active";
  return `${count} ${count === 1 ? "filter" : "filters"} active`;
}

function FilterStatus({
  count,
  activeCount,
  live,
  className,
}: {
  count: number;
  activeCount: number;
  live: boolean;
  className: string;
}) {
  const content = (
    <>
      <span className="font-bold text-foreground">{resultSummary(count)}</span>
      <span> · {activeFilterSummary(activeCount)}</span>
    </>
  );
  if (!live) return <p className={`text-muted-foreground tabular-nums ${className}`}>{content}</p>;
  return (
    <output className={`text-muted-foreground tabular-nums ${className}`} aria-live="polite">
      {content}
    </output>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function numberValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function CheckboxFacet<T extends string>({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">
        {legend} <span className="font-normal text-muted-foreground">({selected.length})</span>
      </legend>
      <div className="grid grid-cols-2 gap-x-4">
        {options.map((option) => (
          <Label
            key={option}
            className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-sm font-normal"
            title={option}
          >
            <Checkbox
              className="size-4 shrink-0 rounded-none border-[var(--playloom-rule-strong)] shadow-none"
              checked={selected.includes(option)}
              onCheckedChange={() => onToggle(option)}
            />
            <span className="truncate">{option}</span>
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

function FranchiseOption({
  franchise,
  filters,
  set,
}: {
  franchise: string;
  filters: DashboardFilters;
  set: Setter;
}) {
  return (
    <Label
      className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-sm font-normal"
      title={franchise}
    >
      <Checkbox
        className="size-4 shrink-0 rounded-none border-[var(--playloom-rule-strong)] shadow-none"
        checked={filters.franchises.includes(franchise)}
        onCheckedChange={() => set({ franchises: toggle(filters.franchises, franchise) })}
      />
      <span className="truncate">{franchise}</span>
    </Label>
  );
}

function FranchiseFacet({ options, filters, set }: FilterControlProps) {
  const [query, setQuery] = useState("");
  const franchises = options.franchises.filter((franchise) =>
    franchise.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  if (options.franchises.length === 0) return null;
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">
        Franchise{" "}
        <span className="font-normal text-muted-foreground">({filters.franchises.length})</span>
      </legend>
      <Input
        type="search"
        aria-label="Search franchises"
        placeholder="Find a franchise…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
      />
      <div className="grid grid-cols-2 gap-x-4">
        {franchises.map((franchise) => (
          <FranchiseOption key={franchise} franchise={franchise} filters={filters} set={set} />
        ))}
      </div>
    </fieldset>
  );
}

interface FilterControlProps {
  options: FacetOptions;
  filters: DashboardFilters;
  set: Setter;
}

function DateFacet({ filters, set }: FilterControlProps) {
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">Last played</legend>
      <div className="grid grid-cols-2 gap-3">
        <Label className="grid gap-1.5 text-xs">
          From
          <Input
            type="date"
            aria-label="Last played from"
            value={filters.lastPlayedFrom ?? ""}
            onChange={(event) => set({ lastPlayedFrom: event.target.value || undefined })}
            className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
          />
        </Label>
        <Label className="grid gap-1.5 text-xs">
          To
          <Input
            type="date"
            aria-label="Last played to"
            value={filters.lastPlayedTo ?? ""}
            onChange={(event) => set({ lastPlayedTo: event.target.value || undefined })}
            className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
          />
        </Label>
      </div>
    </fieldset>
  );
}

function HoursFacet({ options, filters, set }: FilterControlProps) {
  return (
    <fieldset className="grid grid-cols-2 gap-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">Hours played</legend>
      <Label className="grid gap-1.5 text-xs">
        From
        <Input
          type="number"
          aria-label="Minimum hours"
          min={0}
          max={options.maxHours}
          value={filters.minHours ?? ""}
          onChange={(event) => set({ minHours: numberValue(event.target.value) })}
          className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent tabular-nums"
        />
      </Label>
      <Label className="grid gap-1.5 text-xs">
        To
        <Input
          type="number"
          aria-label="Maximum hours"
          min={0}
          max={options.maxHours}
          value={filters.maxHours ?? ""}
          onChange={(event) => set({ maxHours: numberValue(event.target.value) })}
          className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent tabular-nums"
        />
      </Label>
    </fieldset>
  );
}

function SessionsFacet({ options, filters, set }: FilterControlProps) {
  return (
    <Label className="grid gap-1.5 border-t border-[var(--playloom-rule)] pt-5 text-sm font-bold">
      Minimum sessions
      <Input
        type="number"
        aria-label="Minimum sessions"
        min={0}
        max={options.maxSessions}
        value={filters.minSessions ?? ""}
        onChange={(event) => set({ minSessions: numberValue(event.target.value) })}
        className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent tabular-nums"
      />
    </Label>
  );
}

function TrophyFacet({ options, filters, set }: FilterControlProps) {
  if (!options.hasTrophies) return null;
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">Trophies</legend>
      <Label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-normal">
        <Checkbox
          className="size-4 shrink-0 rounded-none border-[var(--playloom-rule-strong)] shadow-none"
          checked={filters.hasPlatinum}
          onCheckedChange={(checked) => set({ hasPlatinum: checked })}
        />
        Has a platinum
      </Label>
      <Label className="grid gap-1.5 text-xs">
        Minimum trophy progress
        <Input
          type="number"
          aria-label="Minimum trophy progress"
          min={0}
          max={100}
          value={filters.minTrophyProgress ?? ""}
          onChange={(event) => set({ minTrophyProgress: numberValue(event.target.value) })}
          className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent tabular-nums"
        />
      </Label>
    </fieldset>
  );
}

function ActivityFacet({ filters, set }: FilterControlProps) {
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">Activity</legend>
      <div className="grid grid-cols-3 border border-[var(--playloom-rule-strong)]">
        {ACTIVITIES.map((activity) => (
          <Label
            key={activity.value}
            className="relative grid min-h-11 cursor-pointer place-items-center border-r border-[var(--playloom-rule-strong)] text-xs font-bold last:border-r-0 has-checked:bg-primary has-checked:text-primary-foreground"
          >
            <input
              className="sr-only"
              type="radio"
              name="game-activity"
              value={activity.value}
              checked={filters.activity === activity.value}
              onChange={() => set({ activity: activity.value })}
            />
            {activity.label}
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterControls(props: FilterControlProps) {
  const { options, filters, set } = props;
  return (
    <div className="space-y-5">
      <CheckboxFacet
        legend="Genre"
        options={options.genres}
        selected={filters.genres}
        onToggle={(value) => set({ genres: toggle(filters.genres, value) })}
      />
      <CheckboxFacet
        legend="Platform"
        options={options.platforms}
        selected={filters.platforms}
        onToggle={(value) => set({ platforms: toggle(filters.platforms, value) })}
      />
      <FranchiseFacet {...props} />
      <DateFacet {...props} />
      <HoursFacet {...props} />
      <SessionsFacet {...props} />
      <TrophyFacet {...props} />
      <ActivityFacet {...props} />
    </div>
  );
}

function FilterTrigger({ count, ...props }: { count: number } & ButtonProps) {
  return (
    <Button
      variant="outline"
      className="min-h-11 rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
      {...props}
    >
      <SlidersHorizontal className="size-4" />
      Filter games
      <Badge
        aria-hidden="true"
        className={`ml-1 w-6 justify-center rounded-none ${count === 0 ? "invisible" : ""}`}
      >
        {count}
      </Badge>
    </Button>
  );
}

interface Props {
  data: DashboardData;
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  resultCount?: number;
  disabled?: boolean;
}

function clearFilters(onChange: Props["onChange"], searchRef: RefObject<HTMLInputElement | null>) {
  onChange(defaultFilters);
  searchRef.current?.focus();
}

interface FilterSheetProps extends Omit<Props, "onChange"> {
  options: FacetOptions;
  activeCount: number;
  set: Setter;
  onOpenStateChange: (open: boolean) => void;
}

function FilterSheetPopup({
  count,
  activeCount,
  options,
  filters,
  set,
  onClear,
}: FilterControlProps & { count: number; activeCount: number; onClear: () => void }) {
  return (
    <SheetPopup
      side="right"
      className="h-dvh w-full max-w-none border-l border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] text-foreground sm:max-w-md"
    >
      <SheetHeader className="border-b border-[var(--playloom-rule-strong)] p-5 pr-14">
        <SheetTitle className="font-[Fraunces_Variable] text-3xl">Filter games</SheetTitle>
        <SheetDescription>
          Applies to Profile, History and Library. Results update immediately.
        </SheetDescription>
        <FilterStatus count={count} activeCount={activeCount} live className="text-sm" />
      </SheetHeader>
      <SheetPanel className="px-5 py-4">
        <FilterControls options={options} filters={filters} set={set} />
      </SheetPanel>
      <SheetFooter className="grid grid-cols-2 border-t border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] px-5 py-4 sm:grid-cols-2">
        <Button
          variant="ghost"
          className="min-h-11 rounded-none border border-[var(--playloom-rule-strong)]"
          onClick={onClear}
        >
          Clear
        </Button>
        <SheetClose render={<Button className="min-h-11 rounded-none">Done filtering</Button>} />
      </SheetFooter>
    </SheetPopup>
  );
}

function FilterSheet({
  data,
  filters,
  resultCount,
  disabled,
  options,
  activeCount,
  set,
  onOpenStateChange,
}: FilterSheetProps) {
  const stable = useStableFilterSheet(set, onOpenStateChange);
  const count = resultCount ?? data.games.length;
  return (
    <Sheet
      modal="trap-focus"
      open={stable.open}
      onOpenChange={stable.onOpenChange}
      onOpenChangeComplete={stable.restoreScroll}
    >
      <SheetTrigger
        render={<FilterTrigger count={activeCount} disabled={disabled} />}
        onPointerDownCapture={stable.captureScroll}
        onKeyDownCapture={stable.captureScroll}
        onClickCapture={stable.captureScroll}
      />
      <FilterSheetPopup
        count={count}
        activeCount={activeCount}
        options={options}
        filters={filters}
        set={stable.setPreservingScroll}
        onClear={() => stable.setPreservingScroll(defaultFilters)}
      />
    </Sheet>
  );
}

function useStableFilterSheet(set: Setter, onOpenStateChange: (open: boolean) => void) {
  const scroll = useRef(0);
  const [open, setOpen] = useState(false);
  const restoreScroll = () => window.scrollTo(0, scroll.current);
  const restoreScrollAfterUpdate = () => {
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  };
  const preserveScroll = (next: boolean) => {
    setOpen(next);
    onOpenStateChange(next);
    restoreScrollAfterUpdate();
  };
  const capture = () => {
    scroll.current = window.scrollY;
  };
  const setPreservingScroll: Setter = (patch) => {
    set(patch);
    restoreScrollAfterUpdate();
  };
  return {
    open,
    onOpenChange: preserveScroll,
    captureScroll: capture,
    restoreScroll,
    setPreservingScroll,
  };
}

function GameSearch({
  searchRef,
  filters,
  disabled,
  set,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  filters: DashboardFilters;
  disabled: boolean;
  set: Setter;
}) {
  return (
    <Input
      ref={searchRef}
      type="search"
      aria-label="Search games by name"
      placeholder="Search games…"
      value={filters.search}
      disabled={disabled}
      onChange={(event) => set({ search: event.target.value })}
      className="min-h-11 w-full rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
    />
  );
}

export function FilterBar({ data, filters, onChange, resultCount, disabled = false }: Props) {
  const options = useMemo(() => facetOptions(data), [data]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(filters);
  const set: Setter = (patch) => onChange({ ...filters, ...patch });
  const clear = () => clearFilters(onChange, searchRef);
  const result = resultCount ?? data.games.length;
  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 xl:w-[28rem]">
      <GameSearch searchRef={searchRef} filters={filters} disabled={disabled} set={set} />
      <FilterSheet
        data={data}
        filters={filters}
        resultCount={resultCount}
        disabled={disabled}
        options={options}
        activeCount={activeCount}
        set={set}
        onOpenStateChange={setSheetOpen}
      />
      <FilterStatus
        count={result}
        activeCount={activeCount}
        live={!sheetOpen}
        className="min-w-0 truncate text-xs text-muted-foreground"
      />
      <Button
        variant="ghost"
        size="sm"
        className={`min-h-8 justify-self-end rounded-none px-2 ${activeCount === 0 ? "invisible" : ""}`}
        disabled={activeCount === 0}
        onClick={clear}
      >
        <X className="size-4" />
        Clear all
      </Button>
    </div>
  );
}
