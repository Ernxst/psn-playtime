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
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {options.map((option) => {
          const id = `filter-${legend}-${option}`;
          return (
            <div key={option} className="flex min-w-0 items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(option)}
                onCheckedChange={() => onToggle(option)}
              />
              <Label htmlFor={id} className="truncate text-sm font-normal" title={option}>
                {option}
              </Label>
            </div>
          );
        })}
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
  const id = `filter-Franchise-${franchise}`;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Checkbox
        id={id}
        checked={filters.franchises.includes(franchise)}
        onCheckedChange={() => set({ franchises: toggle(filters.franchises, franchise) })}
      />
      <Label htmlFor={id} className="truncate text-sm font-normal" title={franchise}>
        {franchise}
      </Label>
    </div>
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
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
      <div className="flex items-center gap-2">
        <Checkbox
          id="filter-platinum"
          checked={filters.hasPlatinum}
          onCheckedChange={(checked) => set({ hasPlatinum: checked })}
        />
        <Label htmlFor="filter-platinum" className="text-sm font-normal">
          Has a platinum
        </Label>
      </div>
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
      {count > 0 && <Badge className="ml-1 rounded-none">{count}</Badge>}
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

interface FilterSheetProps extends Props {
  options: FacetOptions;
  activeCount: number;
  set: Setter;
}

function FilterSheetPopup({
  count,
  options,
  filters,
  set,
  onClear,
}: FilterControlProps & { count: number; onClear: () => void }) {
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
        <output className="text-sm font-bold tabular-nums" aria-live="polite">
          {count} games shown
        </output>
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
  onChange,
  resultCount,
  disabled,
  options,
  activeCount,
  set,
}: FilterSheetProps) {
  const scroll = useRef(0);
  const [open, setOpen] = useState(false);
  const restoreScroll = () => window.scrollTo(0, scroll.current);
  const preserveScroll = (next: boolean) => {
    setOpen(next);
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  };
  const capture = () => (scroll.current = window.scrollY);
  const count = resultCount ?? data.games.length;
  return (
    <Sheet
      modal="trap-focus"
      open={open}
      onOpenChange={preserveScroll}
      onOpenChangeComplete={restoreScroll}
    >
      <span onPointerDownCapture={capture} onKeyDownCapture={capture} onClickCapture={capture}>
        <SheetTrigger render={<FilterTrigger count={activeCount} disabled={disabled} />} />
      </span>
      <FilterSheetPopup
        count={count}
        options={options}
        filters={filters}
        set={set}
        onClear={() => onChange(defaultFilters)}
      />
    </Sheet>
  );
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
      className="min-h-11 w-full rounded-none border-[var(--playloom-rule-strong)] bg-transparent sm:max-w-xs"
    />
  );
}

export function FilterBar({ data, filters, onChange, resultCount, disabled = false }: Props) {
  const options = useMemo(() => facetOptions(data), [data]);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeCount = countActiveFilters(filters);
  const set: Setter = (patch) => onChange({ ...filters, ...patch });
  const clear = () => {
    onChange(defaultFilters);
    searchRef.current?.focus();
  };
  const result = resultCount ?? data.games.length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GameSearch searchRef={searchRef} filters={filters} disabled={disabled} set={set} />
      <FilterSheet
        data={data}
        filters={filters}
        onChange={onChange}
        resultCount={resultCount}
        disabled={disabled}
        options={options}
        activeCount={activeCount}
        set={set}
      />
      {activeCount > 0 && (
        <Button variant="ghost" className="min-h-11 rounded-none" onClick={clear}>
          <X className="size-4" />
          Clear all
        </Button>
      )}
      <output className="sr-only" aria-live="polite">
        {result === 0 ? "No games match" : `${result} games shown`}
      </output>
    </div>
  );
}
