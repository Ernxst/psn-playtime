import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, ChevronDown, Home, Info, LogOut, UserPlus } from "lucide-react";
import { useDeferredValue, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
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
import { prototypeTransactions } from "@/features/prototype/prototype-data";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { type CachedAccount, useCachedAccounts } from "@/stores/dashboard-store";
import { useTransactionImport } from "@/stores/transactions-store";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardEmpty, DashboardNoMatches } from "./states";

interface Props {
  data: DashboardData;
  onRefresh: (npsso: string) => Promise<void>;
  onSignOut: () => void;
  signingOut: boolean;
  safeDemo?: boolean;
}

const TIMEFRAMES: ReadonlyArray<{ value: Timeframe; label: string }> = [
  { value: "all", label: "All time" },
  { value: "last-12-months", label: "12 months" },
  { value: "last-2-years", label: "2 years" },
  { value: "this-year", label: "This year" },
];

function ChapterHeading({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: string;
}) {
  return (
    <header className="playloom-chapter-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </header>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="playloom-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{title}</h3>
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

function TimeframeControl({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
}) {
  return (
    <div className="playloom-timeframe">
      <div>
        <strong>Game filters</strong>
        <span>Applies to Profile, History and Library</span>
      </div>
      <Tabs
        value={value}
        onValueChange={(next) => {
          const match = TIMEFRAMES.find((timeframe) => timeframe.value === next);
          if (match) onChange(match.value);
        }}
      >
        <TabsList aria-label={`Last-played timeframe; current year ${currentYear()}`}>
          {TIMEFRAMES.map((timeframe) => (
            <TabsTab key={timeframe.value} value={timeframe.value}>
              {timeframe.label}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function ImportSource({
  account,
  current,
  onSelect,
}: {
  account: CachedAccount;
  current: boolean;
  onSelect: (accountId: string) => void;
}) {
  const refreshedAt = new Date(account.fetchedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <PopoverClose
      render={
        <button
          type="button"
          className="playloom-account-row"
          aria-label={
            current ? `${account.onlineId}, active account` : `Switch to ${account.onlineId}`
          }
          aria-current={current ? "true" : undefined}
          onClick={() => onSelect(account.accountId)}
        />
      }
    >
      <span className="playloom-platform-dot">PS</span>
      <span>
        <strong>PlayStation · {account.onlineId}</strong>
        <small>
          {current ? "Active" : "Connected"} · refreshed {refreshedAt}
        </small>
      </span>
      {current && <Check aria-label="Active account" />}
    </PopoverClose>
  );
}

function profileAccounts(data: DashboardData, accounts: CachedAccount[]): CachedAccount[] {
  const { profile } = data;
  if (accounts.some((account) => account.accountId === profile.accountId)) return accounts;
  return [
    {
      accountId: profile.accountId,
      onlineId: profile.onlineId,
      avatarUrl: profile.avatarUrl,
      fetchedAt: data.fetchedAt,
    },
    ...accounts,
  ];
}

function ProfileSources({ data }: { data: DashboardData }) {
  const accounts = profileAccounts(data, useCachedAccounts());
  const { dashboardStore } = useRouteContext({ from: "__root__" });
  return (
    <div className="mt-4 border-t pt-3">
      <small className="playloom-import-label">Connected import sources</small>
      {accounts.map((account) => (
        <ImportSource
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
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
      <PopoverTitle>{profile.onlineId}</PopoverTitle>
      <p className="mt-1 text-xs text-muted-foreground">Personal Playloom profile</p>
      <ProfileSources data={data} />
      <Button variant="ghost" className="mt-2 w-full justify-start" render={<Link to="/" />}>
        <UserPlus /> Add PlayStation account
      </Button>
      <Separator className="my-3" />
      <div className="playloom-demo-source">
        <span className="playloom-platform-dot">PL</span>
        <div>
          <strong>Playloom demo profile</strong>
          <small>Stable local evaluation data</small>
        </div>
      </div>
      <Button variant="ghost" className="w-full justify-start" render={<Link to="/dashboard" />}>
        Explore demo profile
      </Button>
    </PopoverContent>
  );
}

function ProfileControl({ data }: { data: DashboardData }) {
  const { profile } = data;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="playloom-profile-trigger"
            aria-label={`Open profile menu for ${profile.onlineId}`}
          />
        }
      >
        <Avatar className="size-9">
          <AvatarImage src={profile.avatarUrl} alt="" />
          <AvatarFallback>{profile.onlineId.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span>
          <strong>{profile.onlineId}</strong>
          <small>Personal profile</small>
        </span>
        <ChevronDown aria-hidden="true" />
      </PopoverTrigger>
      <ProfileMenu data={data} />
    </Popover>
  );
}

function TopBar({ data }: { data: DashboardData }) {
  return (
    <header className="playloom-topbar">
      <SidebarTrigger />
      <span className="playloom-mobile-wordmark">Playloom</span>
      <ProfileControl data={data} />
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
  const account = data.profile.isPlus ? "PlayStation Plus" : "PlayStation account";
  const refreshedAt = new Date(data.fetchedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div>
      <p className="playloom-kicker">A life in games</p>
      <h1>{data.profile.onlineId}</h1>
      <p>{data.profile.aboutMe}</p>
      <div className="playloom-profile-meta">
        <span>{account}</span>
        <span>Trophy level {fmtNumber(data.profile.trophyLevel)}</span>
        <Progress value={data.profile.levelProgress} aria-label="Progress to next trophy level" />
        <span>{data.profile.levelProgress}% to next</span>
      </div>
      <div className="playloom-updated">
        <span className="playloom-status-dot" />
        {refreshed ? "Refreshed just now" : `Last refreshed ${refreshedAt}`}
      </div>
    </div>
  );
}

function AccountActions({ props, onSafeRefresh }: { props: Props; onSafeRefresh: () => void }) {
  if (props.data.isDemo) return null;
  const safeDemo = props.safeDemo === true;
  const refresh = safeDemo ? (
    <RefreshDashboard
      safeDemo
      onRefresh={() => new Promise((resolve) => window.setTimeout(resolve, 700))}
      onComplete={onSafeRefresh}
    />
  ) : (
    <RefreshDashboard onRefresh={props.onRefresh} onComplete={onSafeRefresh} />
  );
  return (
    <div className="playloom-account-actions">
      {refresh}
      <Button variant="ghost" size="sm" onClick={props.onSignOut} disabled={props.signingOut}>
        <LogOut /> {props.signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}

function Marquee(props: Props) {
  const [refreshed, setRefreshed] = useState(false);
  return (
    <header className="playloom-marquee">
      <ProfileSummary data={props.data} refreshed={refreshed} />
      <AccountActions props={props} onSafeRefresh={() => setRefreshed(true)} />
    </header>
  );
}

function DemoNotice() {
  return (
    <div className="playloom-demo-notice">
      <Info />
      <span>
        This <strong>demo dataset</strong> is a stable Playloom profile. Artwork and purchases are
        local fixtures; no network data is required.
      </span>
      <Link to="/dashboard" search={{ prototypeState: "signed-in" }}>
        Open safe signed-in demo
      </Link>
    </div>
  );
}

function ProfileChapter({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-profile">
      <ChapterHeading number="01" title="Profile">
        The shape of your gaming life, from the games you return to and the patterns they leave
        behind.
      </ChapterHeading>
      <Section id="overview" title="Overview">
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

function SpendingChapter({ data }: { data: DashboardData }) {
  return (
    <div className="playloom-chapter playloom-chapter-spending">
      <ChapterHeading number="03" title="Spending">
        What the library cost, kept separate from when those games were last played.
      </ChapterHeading>
      <Section id="spending" title="Spending and purchase history">
        <PrototypeSpending data={data} />
      </Section>
      <Section id="purchase-data" title="Connected purchase data">
        <div className="space-y-6">
          <div id="spend">
            <SpendSection data={data} />
          </div>
          <div id="purchase-history">
            <PurchaseHistorySection data={data} />
          </div>
          <div id="spent-most">
            <SpentMostSection data={data} />
          </div>
          <div id="add-ons">
            <AddOnsSection data={data} />
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

function ToolsChapter({ data, safeDemo }: { data: DashboardData; safeDemo: boolean }) {
  const imported = useTransactionImport(data.profile.accountId);
  const stableDemo = data.isDemo || safeDemo;
  const transactions = imported?.transactions ?? (stableDemo ? prototypeTransactions : []);
  return (
    <div className="playloom-chapter playloom-chapter-tools">
      <ChapterHeading number="05" title="Tools">
        Ask questions of the archive, move your data, or remove local records.
      </ChapterHeading>
      <Section id="ask-ai" title="Ask AI">
        <LlmPromptCard data={data} />
      </Section>
      <Section id="data-controls" title="Data controls">
        <div className="playloom-tools-grid">
          <ExportButtons data={data} transactions={transactions} />
          <RemoveTransactions accountId={data.profile.accountId} />
        </div>
      </Section>
    </div>
  );
}

function DashboardChapters({
  data,
  account,
  safeDemo,
}: {
  data: DashboardData;
  account: DashboardData;
  safeDemo: boolean;
}) {
  return (
    <>
      <ProfileChapter data={data} />
      <HistoryChapter data={data} />
      <SpendingChapter data={account} />
      <LibraryChapter data={data} />
      <ToolsChapter data={account} safeDemo={safeDemo} />
    </>
  );
}

function FilterScope({
  data,
  filters,
  onChange,
}: {
  data: DashboardData;
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}) {
  return (
    <div className="playloom-filter-scope">
      <TimeframeControl
        value={filters.timeframe}
        onChange={(timeframe) => onChange({ ...filters, timeframe })}
      />
      <FilterBar data={data} filters={filters} onChange={onChange} />
    </div>
  );
}

function DashboardResult({
  source,
  scoped,
  onClear,
  safeDemo,
}: {
  source: DashboardData;
  scoped: DashboardData;
  onClear: () => void;
  safeDemo: boolean;
}) {
  if (scoped.games.length > 0) {
    return <DashboardChapters data={scoped} account={source} safeDemo={safeDemo} />;
  }
  if (source.games.length === 0) return <DashboardEmpty />;
  return <DashboardNoMatches onClear={onClear} />;
}

function ReadingSurface(props: Props) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const deferredSearch = useDeferredValue(filters.search);
  const scoped = applyFilters(props.data, { ...filters, search: deferredSearch });
  return (
    <main className="playloom-reading-surface">
      <Marquee {...props} />
      {props.data.isDemo && <DemoNotice />}
      <FilterScope data={props.data} filters={filters} onChange={setFilters} />
      <DashboardResult
        source={props.data}
        scoped={scoped}
        onClear={() => setFilters(defaultFilters)}
        safeDemo={props.safeDemo === true}
      />
      <footer className="playloom-mobile-footer">
        <a href="https://rawg.io" target="_blank" rel="noreferrer">
          Game metadata and artwork provided by RAWG
        </a>
      </footer>
    </main>
  );
}

export function DashboardView(props: Props) {
  return (
    <SidebarProvider>
      <DashboardSidebar profile={props.data.profile} />
      <SidebarInset className="playloom-shell">
        <TopBar data={props.data} />
        <ReadingSurface {...props} />
      </SidebarInset>
    </SidebarProvider>
  );
}
