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
  currentYear,
  defaultFilters,
  type Timeframe,
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

const TIMEFRAMES: ReadonlyArray<{ value: Timeframe; label: string }> = [
  { value: "all", label: "All time" },
  { value: "last-12-months", label: "12 months" },
  { value: "last-2-years", label: "2 years" },
  { value: "this-year", label: "This year" },
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

type DateValidation = "valid" | "format" | "calendar";

const DATE_FEEDBACK: Partial<Record<DateValidation, string>> = {
  format: "Use YYYY-MM-DD.",
  calendar: "Enter a real calendar date in YYYY-MM-DD.",
};

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(value);
}

function validateDate(value: string): DateValidation {
  if (value === "") return "valid";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "format";
  return isCalendarDate(value) ? "valid" : "calendar";
}

function DateFeedback({ feedback, id }: { feedback: string | undefined; id: string }) {
  if (feedback === undefined) return null;
  return (
    <output id={id} className="text-xs leading-relaxed text-destructive" aria-live="polite">
      {feedback}
    </output>
  );
}

function DateInput({
  label,
  appliedValue,
  onApply,
}: {
  label: "From" | "To";
  appliedValue: string;
  onApply: (value: string | undefined) => void;
}) {
  const [validation, setValidation] = useState<DateValidation>("valid");
  const feedback = DATE_FEEDBACK[validation];
  const name = `Last played ${label.toLocaleLowerCase()}`;
  const feedbackId = `last-played-${label.toLocaleLowerCase()}-feedback`;

  return (
    <Label className="grid gap-1.5 text-xs">
      {label}
      <Input
        type="text"
        aria-label={name}
        aria-invalid={feedback !== undefined}
        aria-describedby={feedback === undefined ? undefined : feedbackId}
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        pattern="\\d{4}-\\d{2}-\\d{2}"
        defaultValue={appliedValue}
        onChange={(event) => {
          const next = event.target.value;
          const nextValidation = validateDate(next);
          setValidation(nextValidation);
          if (nextValidation === "valid") onApply(next || undefined);
        }}
        className="rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
      />
      <DateFeedback feedback={feedback} id={feedbackId} />
    </Label>
  );
}

function DateFacet({ filters, set }: FilterControlProps) {
  return (
    <fieldset className="space-y-3 border-t border-[var(--playloom-rule)] pt-5">
      <legend className="pr-3 text-sm font-bold">Last-played range</legend>
      <p className="max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
        Dates select games by when you last played them. Hours shown elsewhere remain lifetime
        totals.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <DateInput
          key={`from-${filters.lastPlayedFrom ?? ""}`}
          label="From"
          appliedValue={filters.lastPlayedFrom ?? ""}
          onApply={(lastPlayedFrom) => set({ lastPlayedFrom })}
        />
        <DateInput
          key={`to-${filters.lastPlayedTo ?? ""}`}
          label="To"
          appliedValue={filters.lastPlayedTo ?? ""}
          onApply={(lastPlayedTo) => set({ lastPlayedTo })}
        />
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

function TimeframeOption({
  timeframe,
  filters,
  disabled,
  set,
}: {
  timeframe: (typeof TIMEFRAMES)[number];
  filters: DashboardFilters;
  disabled: boolean;
  set: Setter;
}) {
  return (
    <Label className="relative grid min-h-11 cursor-pointer place-items-center border-b border-r border-[var(--playloom-rule-strong)] px-2 text-center text-xs font-bold outline-none last:border-r-0 has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-[-2px] has-focus-visible:outline-ring sm:border-b-0">
      <input
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        type="radio"
        name="last-played-timeframe"
        value={timeframe.value}
        checked={filters.timeframe === timeframe.value}
        disabled={disabled}
        onChange={() => set({ timeframe: timeframe.value })}
      />
      <span className="pointer-events-none">{timeframe.label}</span>
    </Label>
  );
}

function TimeframeControl({
  filters,
  disabled,
  set,
}: {
  filters: DashboardFilters;
  disabled: boolean;
  set: Setter;
}) {
  return (
    <fieldset className="min-w-0" aria-describedby="timeframe-semantics">
      <legend className="mb-1 text-xs font-bold">Last played</legend>
      <div className="grid grid-cols-2 border border-[var(--playloom-rule-strong)] lg:grid-cols-4">
        {TIMEFRAMES.map((timeframe) => (
          <TimeframeOption
            key={timeframe.value}
            timeframe={timeframe}
            filters={filters}
            disabled={disabled}
            set={set}
          />
        ))}
      </div>
      <p
        id="timeframe-semantics"
        className="mt-1.5 max-w-[48ch] text-xs leading-relaxed text-muted-foreground"
      >
        Selects games by last played. Displayed hours remain lifetime totals. Current year:{" "}
        {currentYear()}.
      </p>
    </fieldset>
  );
}

function ActivityControl({
  filters,
  disabled,
  set,
}: {
  filters: DashboardFilters;
  disabled: boolean;
  set: Setter;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-bold">Activity</legend>
      <div className="grid grid-cols-3 border border-[var(--playloom-rule-strong)]">
        {ACTIVITIES.map((activity) => (
          <Label
            key={activity.value}
            className="relative grid min-h-11 cursor-pointer place-items-center border-r border-[var(--playloom-rule-strong)] px-2 text-xs font-bold outline-none last:border-r-0 has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-[-2px] has-focus-visible:outline-ring"
          >
            <input
              className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
              type="radio"
              name="game-activity"
              value={activity.value}
              checked={filters.activity === activity.value}
              disabled={disabled}
              onChange={() => set({ activity: activity.value })}
            />
            <span className="pointer-events-none">{activity.label}</span>
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
    </div>
  );
}

function FilterTrigger({ count, ...props }: { count: number } & ButtonProps) {
  return (
    <Button
      variant="outline"
      className="h-11 min-h-11 rounded-none border-[var(--playloom-rule-strong)] bg-transparent"
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

function useStableFilterChanges(onChange: Props["onChange"]) {
  const scroll = useRef(0);
  return (next: DashboardFilters) => {
    scroll.current = window.scrollY;
    onChange(next);
    window.requestAnimationFrame(() => window.scrollTo(0, scroll.current));
  };
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
    <Label className="grid min-w-0 gap-1 text-xs font-bold">
      Search games
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
    </Label>
  );
}

function NoResultsRecovery({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-[var(--playloom-rule)] pt-3">
      <p className="text-sm text-muted-foreground">
        No games match these filters. Clear them to see your full library again.
      </p>
      <Button variant="outline" className="min-h-11 rounded-none" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}

function FilterTaskSummary({
  result,
  activeCount,
  sheetOpen,
  clear,
}: {
  result: number;
  activeCount: number;
  sheetOpen: boolean;
  clear: () => void;
}) {
  return (
    <div className="grid min-h-11 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <FilterStatus
        count={result}
        activeCount={activeCount}
        live={!sheetOpen}
        className="min-w-0 text-xs text-muted-foreground"
      />
      <Button
        variant="ghost"
        className={`min-h-11 justify-self-start rounded-none px-2 sm:justify-self-end ${activeCount === 0 ? "invisible" : ""}`}
        disabled={activeCount === 0}
        onClick={clear}
      >
        <X className="size-4" />
        Clear all
      </Button>
    </div>
  );
}

function FilterTaskActions(
  props: Omit<FilterSheetProps, "onOpenStateChange"> & {
    sheetOpen: boolean;
    setSheetOpen: (open: boolean) => void;
    clear: () => void;
    result: number;
  }
) {
  return (
    <section aria-labelledby="filter-actions-title" className="min-w-0">
      <p id="filter-actions-title" className="mb-1 text-xs font-bold">
        More filters
      </p>
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <FilterSheet {...props} onOpenStateChange={props.setSheetOpen} />
        <FilterTaskSummary
          result={props.result}
          activeCount={props.activeCount}
          sheetOpen={props.sheetOpen}
          clear={props.clear}
        />
      </div>
    </section>
  );
}

export function FilterBar({ data, filters, onChange, resultCount, disabled = false }: Props) {
  const options = useMemo(() => facetOptions(data), [data]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(filters);
  const setFilters = useStableFilterChanges(onChange);
  const set: Setter = (patch) => setFilters({ ...filters, ...patch });
  const clear = () => clearFilters(setFilters, searchRef);
  const result = resultCount ?? data.games.length;
  return (
    <div className="grid w-full gap-5" data-filter-task="">
      <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 md:items-start xl:grid-cols-4">
        <GameSearch searchRef={searchRef} filters={filters} disabled={disabled} set={set} />
        <TimeframeControl filters={filters} disabled={disabled} set={set} />
        <ActivityControl filters={filters} disabled={disabled} set={set} />
        <FilterTaskActions
          data={data}
          filters={filters}
          resultCount={resultCount}
          disabled={disabled}
          options={options}
          activeCount={activeCount}
          set={set}
          sheetOpen={sheetOpen}
          setSheetOpen={setSheetOpen}
          clear={clear}
          result={result}
        />
      </div>
      {result === 0 && activeCount > 0 && <NoResultsRecovery onClear={clear} />}
    </div>
  );
}
