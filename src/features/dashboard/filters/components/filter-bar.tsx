import { SlidersHorizontal, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
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

const toGenre = (g: GamePlay): Genre => g.genre;
const toPlatform = (g: GamePlay): Platform => g.platform;
const toFranchise = (g: GamePlay): string[] => (g.franchise ? [g.franchise] : []);
const toHours = (g: GamePlay): number => g.hours;
const toSessions = (g: GamePlay): number => g.playCount;
const hasTrophy = (g: GamePlay): boolean => g.trophy !== undefined;

/** Distinct facet values present in the (unfiltered) library, for the controls. */
function facetOptions(data: DashboardData): FacetOptions {
  const games = data.games;
  return {
    genres: [...new Set(games.map(toGenre))].toSorted(),
    platforms: [...new Set(games.map(toPlatform))].toSorted(),
    franchises: [...new Set(games.flatMap(toFranchise))].toSorted(),
    maxHours: Math.ceil(Math.max(0, ...games.map(toHours))),
    maxSessions: Math.max(0, ...games.map(toSessions)),
    hasTrophies: games.some(hasTrophy),
  };
}

const ACTIVITIES: ReadonlyArray<{ value: Activity; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "dormant", label: "Dormant" },
];

function countActiveFilters(f: DashboardFilters): number {
  const flags = [
    f.timeframe !== "all",
    f.search.trim() !== "",
    f.genres.length > 0,
    f.franchises.length > 0,
    f.platforms.length > 0,
    f.lastPlayedFrom !== undefined,
    f.lastPlayedTo !== undefined,
    f.minHours !== undefined,
    f.maxHours !== undefined,
    f.minSessions !== undefined,
    f.hasPlatinum,
    f.minTrophyProgress !== undefined,
    f.activity !== "all",
  ];
  return flags.filter(Boolean).length;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function toActivity(value: unknown): Activity {
  return value === "active" || value === "dormant" ? value : "all";
}

/** Read the lower bound from a slider change that may arrive as a scalar or pair. */
function firstNumber(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

function pair(value: number | readonly number[], fallbackHi: number): [number, number] {
  if (typeof value === "number") return [value, value];
  return [value[0] ?? 0, value[1] ?? fallbackHi];
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {options.map((option) => {
          const id = `filter-${legend}-${option}`;
          return (
            <div key={option} className="flex items-center gap-2">
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

function DateFacet({ filters, set }: { filters: DashboardFilters; set: Setter }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Last played</legend>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="Last played from"
          value={filters.lastPlayedFrom ?? ""}
          onChange={(event) => set({ lastPlayedFrom: event.target.value || undefined })}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="Last played to"
          value={filters.lastPlayedTo ?? ""}
          onChange={(event) => set({ lastPlayedTo: event.target.value || undefined })}
        />
      </div>
    </fieldset>
  );
}

function HoursFacet({
  max,
  filters,
  set,
}: {
  max: number;
  filters: DashboardFilters;
  set: Setter;
}) {
  const lo = filters.minHours ?? 0;
  const hi = filters.maxHours ?? max;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        Hours: {lo}–{hi}
      </legend>
      <Slider
        min={0}
        max={max}
        value={[lo, hi]}
        thumbLabels={["Minimum hours", "Maximum hours"]}
        onValueChange={(value) => {
          const [a, b] = pair(value, max);
          set({ minHours: a === 0 ? undefined : a, maxHours: b === max ? undefined : b });
        }}
      />
    </fieldset>
  );
}

function SessionsFacet({
  max,
  filters,
  set,
}: {
  max: number;
  filters: DashboardFilters;
  set: Setter;
}) {
  const value = filters.minSessions ?? 0;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Min sessions: {value}</legend>
      <Slider
        min={0}
        max={max}
        value={value}
        thumbLabels={["Minimum sessions"]}
        onValueChange={(next) => {
          const n = firstNumber(next);
          set({ minSessions: n === 0 ? undefined : n });
        }}
      />
    </fieldset>
  );
}

function TrophyFacet({ filters, set }: { filters: DashboardFilters; set: Setter }) {
  const progress = filters.minTrophyProgress ?? 0;
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Trophies</legend>
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
      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">Min progress: {progress}%</span>
        <Slider
          min={0}
          max={100}
          value={progress}
          thumbLabels={["Minimum trophy progress"]}
          onValueChange={(next) => {
            const n = firstNumber(next);
            set({ minTrophyProgress: n === 0 ? undefined : n });
          }}
        />
      </div>
    </fieldset>
  );
}

function ActivityFacet({ filters, set }: { filters: DashboardFilters; set: Setter }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Activity</legend>
      <Tabs value={filters.activity} onValueChange={(next) => set({ activity: toActivity(next) })}>
        <TabsList>
          {ACTIVITIES.map((a) => (
            <TabsTab key={a.value} value={a.value}>
              {a.label}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>
    </fieldset>
  );
}

function SelectFacets({
  options,
  filters,
  set,
}: {
  options: FacetOptions;
  filters: DashboardFilters;
  set: Setter;
}) {
  return (
    <>
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
      <CheckboxFacet
        legend="Franchise"
        options={options.franchises}
        selected={filters.franchises}
        onToggle={(value) => set({ franchises: toggle(filters.franchises, value) })}
      />
    </>
  );
}

function FilterControls({
  options,
  filters,
  set,
}: {
  options: FacetOptions;
  filters: DashboardFilters;
  set: Setter;
}) {
  return (
    <div className="space-y-4">
      <SelectFacets options={options} filters={filters} set={set} />
      <Separator />
      <DateFacet filters={filters} set={set} />
      <HoursFacet max={options.maxHours} filters={filters} set={set} />
      <SessionsFacet max={options.maxSessions} filters={filters} set={set} />
      {options.hasTrophies ? (
        <>
          <Separator />
          <TrophyFacet filters={filters} set={set} />
        </>
      ) : null}
      <Separator />
      <ActivityFacet filters={filters} set={set} />
    </div>
  );
}

/** Spreads Base UI's injected trigger props (onClick, ref, aria-*) onto the Button. */
function FilterTrigger({ count, ...props }: { count: number } & ButtonProps) {
  return (
    <Button variant="outline" {...props}>
      <SlidersHorizontal className="size-4" />
      Filters
      {count > 0 ? (
        <Badge variant="secondary" className="ml-1">
          {count}
        </Badge>
      ) : null}
    </Button>
  );
}

interface Props {
  data: DashboardData;
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

export function FilterBar({ data, filters, onChange }: Props) {
  const options = useMemo(() => facetOptions(data), [data]);
  const activeCount = countActiveFilters(filters);
  const set: Setter = (patch) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        aria-label="Search games by name"
        placeholder="Search games…"
        value={filters.search}
        onChange={(event) => set({ search: event.target.value })}
        className="w-full max-w-xs"
      />
      <Popover>
        <PopoverTrigger render={<FilterTrigger count={activeCount} />} />
        <PopoverContent align="start" className="w-90 max-w-[calc(100vw-2rem)]">
          <FilterControls options={options} filters={filters} set={set} />
        </PopoverContent>
      </Popover>
      {activeCount > 0 ? (
        <Button variant="ghost" onClick={() => onChange(defaultFilters)}>
          <X className="size-4" />
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
