import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, ChevronDown, Home, LogOut, UserPlus } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RefreshDashboard } from "@/features/dashboard/components/refresh-dashboard";
import { RemoveTransactions } from "@/features/dashboard/components/remove-transactions";
import { ExportButtons } from "@/features/dashboard/export/components/export-buttons";
import {
  applyFilters,
  currentYear,
  type DashboardFilters,
  defaultFilters,
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
import { type CachedAccount, useAvailableAccounts } from "@/stores/dashboard-store";
import { useDashboardTransactionImport } from "@/stores/transactions-store";
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

function ChartPlaceholder({ height = 340 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

function DeferredSection({ children, height }: { children: React.ReactNode; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);

  /* oxlint-disable react/react-compiler -- useSyncExternalStore requires stable subscription identity; its mutable refs are intentionally not reactive dependencies */
  const subscribe = useCallback((onStoreChange: () => void) => {
    const element = ref.current;
    if (!element) return () => {};

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          visibleRef.current = true;
          observer.disconnect();
          onStoreChange();
        }
      },
      { rootMargin: "400px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  /* oxlint-enable react/react-compiler */

  // One-shot reveal flag read during render: useSyncExternalStore subscribes the observer,
  // the snapshot is the flag, and the server snapshot defaults to not-visible.
  const visible = useSyncExternalStore(
    subscribe,
    () => visibleRef.current,
    () => false
  );

  return (
    <div ref={ref}>
      {visible ? (
        <Suspense fallback={<ChartPlaceholder height={height} />}>{children}</Suspense>
      ) : (
        <ChartPlaceholder height={height} />
      )}
    </div>
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

function AccountAvatar({ account }: { account: CachedAccount }) {
  return (
    <Avatar className="size-8 rounded-none">
      <AvatarImage src={account.avatarUrl} alt={`${account.onlineId} avatar`} />
      <AvatarFallback className="rounded-none bg-primary text-xs text-primary-foreground">
        {account.onlineId.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function accountLabels(account: CachedAccount, current: boolean) {
  const refreshedAt = new Date(account.fetchedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    action: current ? `${account.onlineId}, active profile` : `Switch to ${account.onlineId}`,
    detail: `${account.avatarLabel} · refreshed ${refreshedAt}`,
    state: current ? "active" : "available",
  };
}

function AccountSource({
  account,
  current,
  onSelect,
}: {
  account: CachedAccount;
  current: boolean;
  onSelect: (accountId: string) => void;
}) {
  const labels = accountLabels(account, current);
  return (
    <PopoverClose
      render={
        <button
          type="button"
          className="grid w-full grid-cols-[2.125rem_minmax(0,1fr)_1.25rem] items-center gap-2.5 border border-transparent p-2.5 text-left transition-colors duration-200 hover:border-primary/25 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={labels.action}
          aria-current={current ? "true" : undefined}
          onClick={() => onSelect(account.accountId)}
        />
      }
    >
      <AccountAvatar account={account} />
      <span className="flex min-w-0 flex-col">
        <strong>{account.onlineId}</strong>
        <small className="text-muted-foreground">
          {account.sourceLabel} · {labels.state}
        </small>
        <small className="text-muted-foreground">{labels.detail}</small>
      </span>
      {current && <Check aria-label="Active profile" />}
    </PopoverClose>
  );
}

function ProfileSources({ data }: { data: DashboardData }) {
  const accounts = useAvailableAccounts();
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return (
    <div className="mt-4 border-t border-[var(--playloom-rule-strong)] pt-3">
      <small className="mb-2 block text-[0.5625rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        Available profiles
      </small>
      {accounts.map((account) => (
        <AccountSource
          key={account.accountId}
          account={account}
          current={account.accountId === data.profile.accountId}
          onSelect={(accountId) => dashboardStore.setActive(accountId)}
        />
      ))}
    </div>
  );
}

function ProfileMenu({ data }: { data: DashboardData }) {
  const { profile } = data;
  return (
    <PopoverContent
      align="end"
      className="w-80 max-w-[calc(100vw-2rem)] rounded-none border-[var(--playloom-rule-strong)] bg-[var(--playloom-paper-raised)] p-5 text-foreground shadow-[0_12px_30px_var(--playloom-shadow)] before:rounded-none"
    >
      <PopoverTitle className="font-[Fraunces_Variable] text-xl font-semibold">
        {profile.onlineId}
      </PopoverTitle>
      <p className="mt-1 text-xs text-muted-foreground">
        {profile.sourceLabel ?? "Imported from PlayStation"}
      </p>
      <ProfileSources data={data} />
      <Button
        variant="ghost"
        className="mt-3 w-full justify-start rounded-none border border-[var(--playloom-rule-strong)] bg-transparent text-foreground hover:bg-accent"
        render={<Link to="/" hash="connect" />}
      >
        <UserPlus /> Add PlayStation account
      </Button>
    </PopoverContent>
  );
}

function ProfileTrigger({ data, capture }: { data: DashboardData; capture: () => void }) {
  const { profile } = data;
  const sourceLabel = profile.sourceLabel ?? "Imported from PlayStation";
  return (
    <span onPointerDownCapture={capture} onKeyDownCapture={capture} onClickCapture={capture}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-11 min-w-0 rounded-none px-2 text-foreground hover:bg-accent focus-visible:ring-ring"
            aria-label={`Open profile menu for ${profile.onlineId}, ${sourceLabel}`}
          />
        }
      >
        <Avatar className="size-9 rounded-none">
          <AvatarImage src={profile.avatarUrl} alt={`${profile.onlineId} avatar`} />
          <AvatarFallback className="rounded-none bg-primary text-primary-foreground">
            {profile.onlineId.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col items-start leading-[1.1]">
          <strong className="max-w-35 truncate">{profile.onlineId}</strong>
          <small className="text-[0.625rem] text-muted-foreground">{sourceLabel}</small>
        </span>
        <ChevronDown aria-hidden="true" />
      </PopoverTrigger>
    </span>
  );
}

function ProfileControl({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false);
  const scroll = useRef(0);
  const restoreScroll = () => window.scrollTo(0, scroll.current);
  const preserveScroll = (next: boolean) => {
    setOpen(next);
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  };
  return (
    <Popover open={open} onOpenChange={preserveScroll} onOpenChangeComplete={restoreScroll}>
      <ProfileTrigger data={data} capture={() => (scroll.current = window.scrollY)} />
      <ProfileMenu data={data} />
    </Popover>
  );
}

function TopBar({ data }: { data: DashboardData }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-15 items-center gap-2 border-b border-[var(--playloom-rule)] bg-[rgb(243_239_229/96%)] px-5 backdrop-blur-md">
      <SidebarTrigger className="size-11 md:hidden" aria-label="Open chapter navigation" />
      <span className="font-[Fraunces_Variable] text-xl font-semibold md:hidden">Playloom</span>
      <div className="ml-auto">
        <ProfileControl data={data} />
      </div>
      <Button
        variant="ghost"
        size="icon"
        render={
          <Link to="/" aria-label="Go to Playloom home">
            <Home />
          </Link>
        }
      />
    </header>
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
    />
  );
}

function SignOutAction({ props }: { props: Props }) {
  if (!props.onSignOut) return null;
  return (
    <Button variant="ghost" size="sm" onClick={props.onSignOut} disabled={props.signingOut}>
      <LogOut /> {props.signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}

function AccountActions({ props, onSafeRefresh }: { props: Props; onSafeRefresh: () => void }) {
  if (!props.onRefresh && !props.onSignOut) return null;
  return (
    <div className="flex h-fit gap-1.5">
      <RefreshAction props={props} onComplete={onSafeRefresh} />
      <SignOutAction props={props} />
    </div>
  );
}

function Marquee(props: Props) {
  const [refreshed, setRefreshed] = useState(false);
  return (
    <header className="flex min-h-[11.5rem] justify-between gap-5 overflow-hidden bg-[radial-gradient(circle_at_85%_10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_34%),linear-gradient(145deg,var(--playloom-paper-raised)_0%,var(--playloom-paper-deep)_100%)] px-[clamp(1.25rem,5vw,4rem)] py-6 max-sm:min-h-0 max-sm:flex-col max-sm:px-5 max-sm:py-6">
      <ProfileSummary data={props.data} refreshed={refreshed} />
      <AccountActions props={props} onSafeRefresh={() => setRefreshed(true)} />
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

function ReadingSurface(props: Props) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
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
      <Marquee {...props} />
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
  return (
    <SidebarProvider>
      <DashboardSidebar profile={props.data.profile} />
      <SidebarInset className="min-w-0 overflow-x-clip bg-[var(--playloom-ink)]">
        <TopBar data={props.data} />
        <ReadingSurface {...props} />
      </SidebarInset>
    </SidebarProvider>
  );
}
