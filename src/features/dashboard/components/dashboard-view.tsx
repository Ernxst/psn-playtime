import { LogOut } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RefreshDashboard } from "@/features/dashboard/components/refresh-dashboard";
import { RemoveTransactions } from "@/features/dashboard/components/remove-transactions";
import { ExportButtons } from "@/features/dashboard/export/components/export-buttons";
import {
  applyFilters,
  currentYear,
  type DashboardFilters,
  defaultFilters,
  retainValidFilters,
  type Timeframe,
} from "@/features/dashboard/filters/analytics";
import { FilterBar } from "@/features/dashboard/filters/components/filter-bar";
import {
  AppsExcludedNote,
  ComebacksCard,
  LifespansCard,
  RecencyCard,
  ValueCard,
} from "@/features/dashboard/filters/components/insights";
import { fmtNumber } from "@/features/dashboard/format";
import { LlmPromptCard } from "@/features/dashboard/prompt/components/llm-prompt-card";
import { PurchaseHistorySection } from "@/features/dashboard/spend/components/purchase-history";
import {
  AddOnsSection,
  SpendSection,
  SpentMostSection,
} from "@/features/dashboard/spend/components/spend";
import { TrophySection } from "@/features/dashboard/trophies/components/trophies";
import {
  HistoryViews,
  PlatinumShelf,
  ProfileOverview,
  ProfileRanks,
  PrototypeLibrary,
  PrototypeSpending,
} from "@/features/prototype/dashboard-sections";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useDashboardTransactionImport } from "@/stores/transactions-store";
import { AccountSwitcher } from "./account-switcher";
import { DashboardShellHeader } from "./dashboard-shell-header";
import { alignHashDestination, DashboardSidebar } from "./dashboard-sidebar";
import { DashboardEmpty, DashboardNoMatches, DashboardPartialNotice } from "./states";

interface Props {
  data: DashboardData;
  onRefresh?: (npsso: string) => Promise<void>;
  onSignOut?: () => void;
  signingOut: boolean;
  safeDemo?: boolean;
  partialData?: boolean;
}

const TIMEFRAMES: ReadonlyArray<{ value: Timeframe; label: string }> = [
  { value: "all", label: "All time" },
  { value: "last-12-months", label: "12 months" },
  { value: "last-2-years", label: "2 years" },
  { value: "this-year", label: "This year" },
];

type ChapterVariant = "opening" | "chapter";

const chapterClasses: Record<ChapterVariant, { header: string; number: string; title: string }> = {
  opening: {
    header: "mb-6 grid max-w-215 grid-cols-[2rem_minmax(0,1fr)] gap-3",
    number: "pt-1 text-[0.6875rem] font-bold text-primary tabular-nums",
    title:
      "font-[Fraunces_Variable] text-[clamp(2rem,4vw,3rem)] font-semibold tracking-[-0.05em] leading-none text-balance",
  },
  chapter: {
    header:
      "mb-[5.125rem] grid max-w-215 grid-cols-[3rem_minmax(0,1fr)] gap-5 max-sm:mb-[3.625rem] max-sm:grid-cols-[1.875rem_minmax(0,1fr)] max-sm:gap-2.5",
    number: "pt-3 text-[0.6875rem] font-bold text-primary tabular-nums",
    title:
      "font-[Fraunces_Variable] text-[clamp(3.375rem,7vw,5.5rem)] font-semibold tracking-[-0.055em] leading-[0.94] text-balance max-sm:text-[3.125rem]",
  },
};

function ChapterHeading({
  number,
  title,
  children,
  variant = "chapter",
}: {
  number: string;
  title: string;
  children: string;
  variant?: ChapterVariant;
}) {
  const classes = chapterClasses[variant];
  return (
    <header className={classes.header}>
      <span className={classes.number}>{number}</span>
      <div>
        <h2 className={classes.title}>{title}</h2>
        {variant === "chapter" && (
          <p className="mt-5 max-w-[62ch] text-[0.9375rem] leading-[1.65] text-muted-foreground max-sm:text-[0.8125rem]">
            {children}
          </p>
        )}
      </div>
    </header>
  );
}

function Section({
  id,
  title,
  children,
  variant = "chapter",
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  variant?: "opening" | "chapter";
}) {
  const opening = variant === "opening";
  return (
    <section
      id={id}
      className={
        opening
          ? "mt-14 scroll-mt-20 first:mt-0"
          : "mt-[5.375rem] scroll-mt-[4.875rem] max-sm:mt-[4.125rem]"
      }
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
    >
      <h3
        className={
          opening
            ? "mb-6 font-[Fraunces_Variable] text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.035em]"
            : "mb-[1.625rem] font-[Fraunces_Variable] text-[clamp(1.875rem,4vw,2.875rem)] font-semibold tracking-[-0.035em] text-balance max-sm:text-[2.125rem]"
        }
        id={`${id}-title`}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function TimeframeOption({
  timeframe,
  value,
  disabled,
  onChange,
}: {
  timeframe: (typeof TIMEFRAMES)[number];
  value: Timeframe;
  disabled: boolean;
  onChange: (value: Timeframe) => void;
}) {
  return (
    <label className="relative grid min-h-11 cursor-pointer place-items-center border-r border-[var(--playloom-rule-strong)] px-3 text-xs font-bold last:border-r-0 has-checked:bg-primary has-checked:text-primary-foreground">
      <input
        className="sr-only"
        type="radio"
        name="last-played-timeframe"
        checked={value === timeframe.value}
        disabled={disabled}
        onChange={() => onChange(timeframe.value)}
      />
      {timeframe.label}
    </label>
  );
}

function TimeframeControl({
  value,
  onChange,
  disabled,
}: {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col">
        <strong className="text-xs">Game filter scope</strong>
        <span className="text-[0.6875rem] text-muted-foreground">
          Applies to Profile, History and Library
        </span>
      </div>
      <fieldset>
        <legend className="sr-only">Last-played timeframe; current year {currentYear()}</legend>
        <div className="grid grid-cols-4 border border-[var(--playloom-rule-strong)]">
          {TIMEFRAMES.map((timeframe) => (
            <TimeframeOption
              key={timeframe.value}
              timeframe={timeframe}
              value={value}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ProfileSummary({ data, refreshed }: { data: DashboardData; refreshed: boolean }) {
  const account = data.profile.isPlus ? "PlayStation Plus account" : "PlayStation account";
  const refreshedAt = new Date(data.fetchedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div>
      <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-primary uppercase">
        {data.profile.sourceLabel ?? "Imported from PlayStation"}
      </p>
      <h1 className="mt-1 max-w-[16ch] font-[Fraunces_Variable] text-[clamp(2.75rem,5vw,4.5rem)] font-[570] tracking-[-0.06em] leading-[0.92] text-balance">
        {data.profile.onlineId}
      </h1>
      <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground text-pretty max-sm:hidden">
        {data.profile.aboutMe}
      </p>
      <div className="mt-3 flex max-w-130 flex-wrap items-center gap-2.5 text-[0.625rem] text-muted-foreground">
        <span>{account}</span>
        <span>Trophy level {fmtNumber(data.profile.trophyLevel)}</span>
        <Progress
          value={data.profile.levelProgress}
          aria-label="Progress to next trophy level"
          className="w-22.5 gap-0"
        />
        <span>{data.profile.levelProgress}% to next</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[0.6875rem] text-muted-foreground tabular-nums">
        <span className="size-1.75 rounded-full bg-success-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--success-foreground)_12%,transparent)]" />
        {refreshed ? "Refreshed just now" : `Last refreshed ${refreshedAt}`}
      </div>
    </div>
  );
}

function RefreshAction({ props, onComplete }: { props: Props; onComplete: () => void }) {
  if (!props.onRefresh) return null;
  return (
    <RefreshDashboard
      safeDemo={props.safeDemo}
      onRefresh={props.onRefresh}
      onComplete={onComplete}
      shell
    />
  );
}

function SignOutAction({ props }: { props: Props }) {
  if (!props.onSignOut) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 rounded-none px-2 active:scale-[0.96] sm:h-10"
      aria-label={props.signingOut ? "Signing out…" : "Sign out"}
      onClick={props.onSignOut}
      disabled={props.signingOut}
    >
      <LogOut />{" "}
      <span className="max-sm:sr-only">{props.signingOut ? "Signing out…" : "Sign out"}</span>
    </Button>
  );
}

function AccountActions({ props, onSafeRefresh }: { props: Props; onSafeRefresh: () => void }) {
  if (!props.onRefresh && !props.onSignOut) return null;
  return (
    <div className="flex h-fit items-center gap-1">
      <RefreshAction props={props} onComplete={onSafeRefresh} />
      <SignOutAction props={props} />
    </div>
  );
}

function TopBar({ props, onSafeRefresh }: { props: Props; onSafeRefresh: () => void }) {
  return (
    <DashboardShellHeader>
      <AccountActions props={props} onSafeRefresh={onSafeRefresh} />
      <AccountSwitcher profile={props.data.profile} />
    </DashboardShellHeader>
  );
}

function Marquee({ data, refreshed }: { data: DashboardData; refreshed: boolean }) {
  return (
    <header className="min-h-[11.5rem] overflow-hidden bg-[radial-gradient(circle_at_85%_10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_34%),linear-gradient(145deg,var(--playloom-paper-raised)_0%,var(--playloom-paper-deep)_100%)] px-[clamp(1.25rem,5vw,4rem)] py-6 max-sm:min-h-0 max-sm:px-5 max-sm:py-6">
      <ProfileSummary data={data} refreshed={refreshed} />
    </header>
  );
}

function ProfileChapter({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter-profile bg-[#f3efe5] px-[clamp(1.25rem,5vw,4rem)] pt-6 pb-20">
      <ChapterHeading number="01" title="Profile" variant="opening">
        The shape of your gaming life, from the games you return to and the patterns they leave
        behind.
      </ChapterHeading>
      <Section id="overview" title="Overview" variant="opening">
        <ProfileOverview data={data} />
      </Section>
      <Section id="top-games" title="Top games">
        <ProfileRanks data={data} mode="games" />
      </Section>
      <Section id="genres" title="Genres">
        <ProfileRanks data={data} mode="genres" />
      </Section>
      <Section id="franchises" title="Franchises">
        <ProfileRanks data={data} mode="franchises" />
      </Section>
      <Section id="insights" title="Insights">
        <div className="playloom-insights">
          <ValueCard data={data} />
          <RecencyCard data={data} />
          <LifespansCard data={data} />
          <ComebacksCard data={data} />
          <AppsExcludedNote data={data} />
        </div>
      </Section>
    </div>
  );
}

function HistoryChapter({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-history">
      <ChapterHeading number="02" title="History">
        A chronological record of when each world entered your life, and the sessions and trophies
        around it.
      </ChapterHeading>
      <HistoryViews data={data} />
      <Section id="trophies" title="Trophies">
        <PlatinumShelf data={data} />
        <TrophySection data={data} />
      </Section>
    </div>
  );
}

function TransactionUnavailable({ children }: { children: string }) {
  return (
    <div className="border border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] p-5">
      <strong className="text-sm">Transactions unavailable</strong>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function SpendingChapterUnavailable({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-spending">
      <ChapterHeading number="03" title="Spending">
        What the library cost, kept separate from when those games were last played.
      </ChapterHeading>
      <Section id="spending" title="Spending and purchase history">
        <PrototypeSpending
          data={data}
          transactions={[]}
          unavailableMessage="Transaction data is unavailable in this evaluation state."
        />
      </Section>
      <Section id="purchase-data" title="Purchase import">
        <div className="space-y-6">
          <div id="spend" className="scroll-mt-20" tabIndex={-1}>
            <TransactionUnavailable>
              Purchase totals and import controls are unavailable in this evaluation state.
            </TransactionUnavailable>
          </div>
          <div id="purchase-history" className="scroll-mt-20" tabIndex={-1}>
            <TransactionUnavailable>
              Purchase history rows are unavailable in this evaluation state.
            </TransactionUnavailable>
          </div>
          <div id="spent-most" className="scroll-mt-20" tabIndex={-1}>
            <TransactionUnavailable>
              Most-spent rankings are unavailable in this evaluation state.
            </TransactionUnavailable>
          </div>
          <div id="add-ons" className="scroll-mt-20" tabIndex={-1}>
            <TransactionUnavailable>
              Add-on purchase insights are unavailable in this evaluation state.
            </TransactionUnavailable>
          </div>
        </div>
      </Section>
    </div>
  );
}

function SpendingChapter({ data }: { data: DashboardData }) {
  const transactions = useDashboardTransactionImport(data.profile.accountId)?.transactions ?? [];
  return (
    <div className="playloom-chapter playloom-chapter-spending">
      <ChapterHeading number="03" title="Spending">
        What the library cost, kept separate from when those games were last played.
      </ChapterHeading>
      <Section id="spending" title="Spending and purchase history">
        <PrototypeSpending data={data} transactions={transactions} />
      </Section>
      <Section id="purchase-data" title="Purchase import">
        <div className="space-y-6">
          <div id="spend" className="scroll-mt-20" tabIndex={-1}>
            <SpendSection data={data} transactions={transactions} />
          </div>
          <div id="purchase-history" className="scroll-mt-20" tabIndex={-1}>
            <PurchaseHistorySection data={data} transactions={transactions} />
          </div>
          <div id="spent-most" className="scroll-mt-20" tabIndex={-1}>
            <SpentMostSection data={data} transactions={transactions} />
          </div>
          <div id="add-ons" className="scroll-mt-20" tabIndex={-1}>
            <AddOnsSection data={data} transactions={transactions} />
          </div>
        </div>
      </Section>
    </div>
  );
}

function LibraryChapter({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-library">
      <ChapterHeading number="04" title="Library">
        Every title in the archive, still filterable and sortable without losing information on
        mobile.
      </ChapterHeading>
      <Section id="library" title="All games">
        <PrototypeLibrary data={data} />
      </Section>
    </div>
  );
}

function ToolsChapterAvailable({ data }: { data: DashboardData }) {
  const transactions = useDashboardTransactionImport(data.profile.accountId)?.transactions ?? [];
  return (
    <div className="playloom-chapter playloom-chapter-tools">
      <ChapterHeading number="05" title="Tools">
        Ask questions of the archive, move your data, or remove local records.
      </ChapterHeading>
      <Section id="ask-ai" title="Ask AI">
        <LlmPromptCard data={data} />
      </Section>
      <Section id="data-controls" title="Data controls">
        <div className="playloom-tools-grid min-h-[calc(100dvh-10rem)]">
          <ExportButtons data={data} transactions={transactions} />
          <RemoveTransactions accountId={data.profile.accountId} />
        </div>
      </Section>
    </div>
  );
}

function ToolsChapterUnavailable({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-tools">
      <ChapterHeading number="05" title="Tools">
        Ask questions of the archive, move your data, or remove local records.
      </ChapterHeading>
      <Section id="ask-ai" title="Ask AI">
        <TransactionUnavailable>
          Transaction context is excluded from Ask AI while this archive is partial.
        </TransactionUnavailable>
        <div className="mt-4">
          <LlmPromptCard data={data} transactions={[]} />
        </div>
      </Section>
      <Section id="data-controls" title="Data controls">
        <div className="playloom-tools-grid min-h-[calc(100dvh-10rem)]">
          <TransactionUnavailable>
            Transaction export and removal are unavailable while this archive is partial.
          </TransactionUnavailable>
          <ExportButtons data={data} transactions={[]} />
        </div>
      </Section>
    </div>
  );
}

function DashboardChapters({
  data,
  account,
  partialData,
}: {
  data: DashboardData;
  account: DashboardData;
  partialData: boolean;
}) {
  return (
    <>
      <ProfileChapter data={data} />
      <HistoryChapter data={data} />
      {partialData ? (
        <SpendingChapterUnavailable data={account} />
      ) : (
        <SpendingChapter data={account} />
      )}
      <LibraryChapter data={data} />
      {partialData ? (
        <ToolsChapterUnavailable data={account} />
      ) : (
        <ToolsChapterAvailable data={account} />
      )}
    </>
  );
}

function FilterScope({
  data,
  filters,
  resultCount,
  onChange,
}: {
  data: DashboardData;
  filters: DashboardFilters;
  resultCount: number;
  onChange: (filters: DashboardFilters) => void;
}) {
  const disabled = data.games.length === 0;
  return (
    <div className="flex flex-col flex-wrap items-stretch gap-4 border-y border-[var(--playloom-rule)] bg-[var(--playloom-paper-raised)] px-[clamp(1.25rem,5vw,4rem)] py-4 xl:flex-row xl:items-end xl:justify-between">
      <TimeframeControl
        disabled={disabled}
        value={filters.timeframe}
        onChange={(timeframe) => onChange({ ...filters, timeframe })}
      />
      <FilterBar
        data={data}
        filters={filters}
        onChange={onChange}
        resultCount={resultCount}
        disabled={disabled}
      />
      {disabled && (
        <p className="w-full text-xs text-muted-foreground">
          Filters become available after games are imported.
        </p>
      )}
    </div>
  );
}

function DashboardResult({
  source,
  scoped,
  onClear,
  partialData,
}: {
  source: DashboardData;
  scoped: DashboardData;
  onClear: () => void;
  partialData: boolean;
}) {
  if (source.games.length === 0) return <DashboardEmpty />;
  return (
    <>
      {scoped.games.length === 0 && <DashboardNoMatches onClear={onClear} />}
      <DashboardChapters data={scoped} account={source} partialData={partialData} />
    </>
  );
}

interface AccountFilters {
  accountId: string;
  value: DashboardFilters;
}

function useAccountFilters(data: DashboardData) {
  const accountId = data.profile.accountId;
  const [state, setState] = useState<AccountFilters>({ accountId, value: defaultFilters });
  const filters =
    state.accountId === accountId ? state.value : retainValidFilters(data, state.value);
  if (state.accountId !== accountId) setState({ accountId, value: filters });
  return {
    filters,
    setFilters: (value: DashboardFilters) => setState({ accountId, value }),
  };
}

function ReadingSurface({ props, refreshed }: { props: Props; refreshed: boolean }) {
  const { filters, setFilters } = useAccountFilters(props.data);
  const deferredSearch = useDeferredValue(filters.search);
  const scoped = applyFilters(props.data, { ...filters, search: deferredSearch });
  const clearFilters = () => {
    setFilters(defaultFilters);
    document.querySelector<HTMLInputElement>('[aria-label="Search games by name"]')?.focus();
  };
  return (
    <div
      className="min-w-0 bg-[var(--playloom-paper)] text-[var(--playloom-ink)]"
      ref={alignHashDestination}
    >
      <Marquee data={props.data} refreshed={refreshed} />
      <FilterScope
        data={props.data}
        filters={filters}
        resultCount={scoped.games.length}
        onChange={setFilters}
      />
      {props.partialData && <DashboardPartialNotice />}
      <DashboardResult
        source={props.data}
        scoped={scoped}
        onClear={clearFilters}
        partialData={props.partialData === true}
      />
      <footer className="playloom-mobile-footer">
        <a href="https://rawg.io" target="_blank" rel="noreferrer">
          Game metadata and artwork provided by RAWG
        </a>
      </footer>
    </div>
  );
}

export function DashboardView(props: Props) {
  const [refreshed, setRefreshed] = useState(false);
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset className="min-w-0 overflow-x-clip bg-[var(--playloom-ink)]">
        <TopBar props={props} onSafeRefresh={() => setRefreshed(true)} />
        <ReadingSurface props={props} refreshed={refreshed} />
      </SidebarInset>
    </SidebarProvider>
  );
}
