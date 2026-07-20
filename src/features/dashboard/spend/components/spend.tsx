import {
  Banknote,
  ChevronDown,
  Coins,
  ExternalLink,
  Gift,
  Info,
  Trophy,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { bookmarkletHref } from "@/domain/transaction-bookmarklet";
import type { TransactionRow } from "@/domain/transactions";
import { useCopied } from "@/features/dashboard/components/copy-button";
import { ExportButtons } from "@/features/dashboard/export/components/export-buttons";
import { fmtHours } from "@/features/dashboard/format";
import {
  type AddOnSummary,
  type SpendSummary,
  summariseAddOns,
  summariseSpend,
  type TitleSpend,
} from "@/features/dashboard/spend/spend";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useTransactionImport } from "@/stores/transactions-store";

function money(currency: string, value: number): string {
  const symbol = currency || "£";
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** £-per-hour, shown to the nearest penny. */
function perHour(currency: string, value: number): string {
  return `${money(currency, value)}/hr`;
}

/** The "Open PlayStation signed in" step — shared verbatim by both branches. */
const openPlayStation = {
  text: (
    <>
      Open PlayStation and make sure you are <strong>signed in</strong>.
    </>
  ),
  href: "https://www.playstation.com/en-gb/",
  linkText: "Open PlayStation",
};

/**
 * Desktop drag step: names the draggable button by its exact visible label so
 * it is unambiguous versus the adjacent "Copy bookmarklet" button. The label
 * string mirrors the `<a>` in `BookmarkletActions` and must stay in sync.
 */
const dragBookmarklet = {
  text: (
    <>
      Drag the <strong>Import PSN spend</strong> button below onto your bookmarks bar (or copy it
      and make a new bookmark).
    </>
  ),
};

/**
 * Mobile run step: how you launch a `javascript:` bookmark differs by platform,
 * so the run instruction splits into labelled per-platform sub-steps (no UA
 * detection — both are shown). On iOS Safari you tap the saved bookmark in the
 * Bookmarks list and it runs; on Chrome/Android tapping it does nothing, so it
 * has to be invoked from the address-bar suggestions on the active tab.
 */
const runOnPsTab = {
  text: "Run it on the PlayStation tab:",
  subSteps: [
    {
      label: "iPhone/iPad (Safari)",
      text: "open your Bookmarks and tap the one you saved — it runs on this page.",
    },
    {
      label: "Android (Chrome)",
      text: (
        <>
          {"type that bookmark's name in the address bar and tap it in the suggestions — "}
          <strong>don't press Enter</strong>.
        </>
      ),
    },
  ],
};

function steps(canDragBookmarklet: boolean): Array<{
  text: ReactNode;
  href?: string;
  linkText?: string;
  subSteps?: Array<{ label: string; text: ReactNode }>;
}> {
  if (canDragBookmarklet) {
    return [
      dragBookmarklet,
      openPlayStation,
      {
        text: "Click the bookmark — it fetches your full purchase history and sends it back here in one click. No navigating or scrolling.",
      },
    ];
  }

  return [
    {
      text: (
        <>
          Tap <strong>Copy bookmarklet</strong> (below).
        </>
      ),
    },
    {
      text: (
        <>
          Add <strong>this page</strong> as a new bookmark.
        </>
      ),
    },
    {
      text: "Edit that bookmark — give it a short name you'll remember, clear out the URL, paste the copied bookmarklet, and save.",
    },
    openPlayStation,
    runOnPsTab,
  ];
}

/** A numbered instruction step, mirroring the onboarding sign-in card. */
function Step({
  index,
  text,
  href,
  linkText,
  subSteps,
}: ReturnType<typeof steps>[number] & { index: number }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index + 1}
      </span>
      <div className="space-y-1">
        <p>{text}</p>
        {subSteps ? (
          <ul className="ml-1 space-y-1 border-l border-border pl-3">
            {subSteps.map((sub) => (
              <li key={sub.label}>
                <strong>{sub.label}:</strong> {sub.text}
              </li>
            ))}
          </ul>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {linkText}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

/** The draggable bookmarklet link plus a copy fallback. */
function BookmarkletActions({ accountId, onlineId }: { accountId: string; onlineId: string }) {
  const [copied, flash] = useCopied();

  const copy = () => {
    void navigator.clipboard
      .writeText(bookmarkletHref(window.location.origin, accountId, onlineId))
      .then(flash);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Drag-only affordance: it exists so fine-pointer users can drag the
          bookmarklet onto their bookmarks bar. Dragging is mouse-only with no
          keyboard equivalent, so it is removed from the tab order and the
          accessibility tree — the keyboard-accessible path is the Copy button. */}
      {/* oxlint-disable-next-line react-doctor/nextjs-no-a-element, react-doctor/no-prevent-default -- draggable javascript: bookmarklet, not a navigation link */}
      <a
        ref={(el) => {
          // Set the `javascript:` href imperatively at commit via a callback
          // ref: React strips it from JSX, and refs don't run during SSR, so
          // the server output stays free of the bookmarklet string.
          if (el) el.href = bookmarkletHref(window.location.origin, accountId, onlineId);
        }}
        href="/import"
        aria-hidden="true"
        tabIndex={-1}
        className="hit-area-y-2 inline-flex h-9 cursor-grab items-center rounded-md border border-border bg-primary px-4 font-medium text-primary-foreground"
        onClick={(e) => e.preventDefault()}
      >
        Import PSN spend
      </a>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy bookmarklet"}
      </Button>
    </div>
  );
}

/** The numbered install steps plus the copy/drag actions — the import how-to. */
function ImportInstructions({ accountId, onlineId }: { accountId: string; onlineId: string }) {
  const canDragBookmarklet = !useMediaQuery("coarse-pointer");

  return (
    <div className="space-y-4 text-sm">
      <ol className="space-y-3 text-muted-foreground">
        {steps(canDragBookmarklet).map((step, i) => (
          <Step key={step.linkText ?? i} index={i} {...step} />
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Transactions imported with this bookmarklet belong to {onlineId}.
      </p>
      <BookmarkletActions accountId={accountId} onlineId={onlineId} />
    </div>
  );
}

/** Why importing takes a manual step — surfaced from the info popover by the heading. */
const whyImportNeeded =
  "Your purchase and play history lives in your PlayStation account, which offers no export — it can only be read from a page you're signed into. That read needs an action from you, which is all the bookmarklet automates once you run it; it does nothing on its own until you choose to import.";

/** Tap-triggered explanation of why the import is a few steps, not one button. */
function WhyImportInfo() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Why an import step is needed"
            className="text-muted-foreground"
          />
        }
      >
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverDescription>{whyImportNeeded}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

/** Prompt shown until the user imports their transaction history. */
function ImportSpendCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4" /> Add your spend
          <WhyImportInfo />
        </CardTitle>
        <CardDescription>
          See £-per-hour value by importing your PlayStation transaction history. No file export,
          one click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportInstructions accountId={data.profile.accountId} onlineId={data.profile.onlineId} />
      </CardContent>
    </Card>
  );
}

/**
 * Collapsed re-import affordance shown alongside the spend summary, so an
 * already-imported user can run the bookmarklet again to update their data.
 */
function ReimportCard({ data }: { data: DashboardData }) {
  return (
    <Card className="lg:col-span-3">
      <CardContent>
        <details className="group">
          <summary className="-m-1 flex cursor-pointer list-none items-center gap-2 rounded-md p-1 text-sm font-medium transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
            <Coins className="size-4 shrink-0" /> Re-import or update your data
            <ChevronDown
              className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-4">
            <ImportInstructions
              accountId={data.profile.accountId}
              onlineId={data.profile.onlineId}
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function TotalsCard({ summary }: { summary: SpendSummary }) {
  const stats = [
    { label: "Total spend", value: money(summary.currency, summary.totalSpend) },
    { label: "Paid games", value: String(summary.paidGames) },
    { label: "Free / included", value: String(summary.freeGames) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" /> What you've spent
        </CardTitle>
        <CardDescription>
          {summary.purchaseCount} purchases joined to your library by title.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 divide-x divide-border">
        {stats.map((s) => (
          <div key={s.label} className="px-2 text-center first:pl-0 last:pr-0">
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ByYearCard({ summary }: { summary: SpendSummary }) {
  if (summary.byYear.length === 0) return null;
  const max = Math.max(...summary.byYear.map((y) => y.spend), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spend by year</CardTitle>
        <CardDescription>Purchases bucketed by transaction date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {summary.byYear.map((y) => (
          <div key={y.year} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground tabular-nums">{y.year}</span>
              <span className="tabular-nums">{money(summary.currency, y.spend)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-[var(--chart-1)]"
                style={{ width: `${(y.spend / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LeaderRow({
  currency,
  leader,
}: {
  currency: string;
  leader: SpendSummary["leaderboard"][number];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate">{leader.name}</div>
        <div className="text-xs text-muted-foreground">
          {money(currency, leader.spend)} · {fmtHours(leader.hours)}
        </div>
      </div>
      <span className="shrink-0 font-semibold tabular-nums">
        {perHour(currency, leader.perHour)}
      </span>
    </div>
  );
}

function UnmatchedFooter({ currency, spend }: { currency: string; spend: number }) {
  if (spend <= 0) return null;
  return (
    <>
      <Separator />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Spend not matched to a played title</span>
        <span className="tabular-nums">{money(currency, spend)}</span>
      </div>
    </>
  );
}

/** The value leaderboard — best £-per-hour first. */
function LeaderboardCard({ summary }: { summary: SpendSummary }) {
  const top = summary.leaderboard.slice(0, 10);
  if (top.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" /> Best value per hour
        </CardTitle>
        <CardDescription>
          What each game cost you per hour played. Lowest is best value.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map((g) => (
          <LeaderRow key={g.titleId} currency={summary.currency} leader={g} />
        ))}
        <UnmatchedFooter currency={summary.currency} spend={summary.unmatchedSpend} />
      </CardContent>
    </Card>
  );
}

interface TransactionSectionProps {
  data: DashboardData;
  transactions?: TransactionRow[];
}

function useSectionTransactions(data: DashboardData, transactions?: TransactionRow[]) {
  const imported = useTransactionImport(data.profile.accountId);
  if (transactions) return transactions;
  if (data.isDemo) return [];
  return imported?.transactions ?? [];
}

/**
 * Dashboard spend section. Shows the import prompt until transactions are
 * imported, then the spend-vs-playtime cards.
 */
export function SpendSection({ data, transactions }: TransactionSectionProps) {
  const rows = useSectionTransactions(data, transactions);
  if (rows.length === 0) {
    return <ImportSpendCard data={data} />;
  }

  const summary = summariseSpend(data, rows);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TotalsCard summary={summary} />
      <ByYearCard summary={summary} />
      <LeaderboardCard summary={summary} />
      <ExportButtons data={data} transactions={rows} />
      <ReimportCard data={data} />
    </div>
  );
}

function EmptySpendCard({ title, children }: { title: string; children: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function TitleSpendRow({ currency, title }: { currency: string; title: TitleSpend }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 truncate">{title.name}</div>
      <span className="shrink-0 font-semibold tabular-nums">{money(currency, title.spend)}</span>
    </div>
  );
}

/**
 * Games ranked by total spend (base game + add-ons), highest first — surfacing
 * the titles the most money went on, distinct from {@link AddOnsSection} (which
 * ranks by add-on count). Every matched title with spend shows, including ones
 * with no playtime. Accounts without matching purchases receive an explicit
 * destination state.
 */
export function SpentMostSection({ data, transactions }: TransactionSectionProps) {
  const rows = useSectionTransactions(data, transactions);
  if (rows.length === 0) {
    return (
      <EmptySpendCard title="No most-spent ranking yet">
        Import purchase transactions to see which games received the most spending.
      </EmptySpendCard>
    );
  }

  const summary = summariseSpend(data, rows);
  if (summary.byTitle.length === 0) {
    return (
      <EmptySpendCard title="No matched game spending">
        Imported purchases could not be matched to games in this archive.
      </EmptySpendCard>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="size-4" /> Spent the most on
        </CardTitle>
        <CardDescription>Games ranked by total spend: base game plus any add-ons.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
        {summary.byTitle.map((t) => (
          <TitleSpendRow key={t.titleId} currency={summary.currency} title={t} />
        ))}
      </CardContent>
    </Card>
  );
}

function AddOnRow({ summary }: { summary: AddOnSummary }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 truncate">{summary.name}</div>
      <span className="shrink-0 font-semibold tabular-nums">
        {summary.addOnCount} {summary.addOnCount === 1 ? "add-on" : "add-ons"}
      </span>
    </div>
  );
}

/**
 * Games the user bought add-ons, DLC or in-game items for — a willingness-to-
 * invest signal distinct from base-game spend. Ranked by number of add-on
 * purchases. Accounts without matching purchases receive an explicit
 * destination state.
 */
export function AddOnsSection({ data, transactions }: TransactionSectionProps) {
  const rows = useSectionTransactions(data, transactions);
  if (rows.length === 0) {
    return (
      <EmptySpendCard title="No add-on purchases yet">
        Import purchase transactions to see add-ons matched to games in this archive.
      </EmptySpendCard>
    );
  }

  const ranked = summariseAddOns(data, rows)
    .slice()
    .sort((a, b) => b.addOnCount - a.addOnCount || a.name.localeCompare(b.name));
  if (ranked.length === 0) {
    return (
      <EmptySpendCard title="No matched add-ons">
        The imported purchase history has no add-ons matched to games in this archive.
      </EmptySpendCard>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" /> Spent extra on
        </CardTitle>
        <CardDescription>
          Games you bought add-ons, DLC or in-game items for, ranked by number of add-on purchases.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
        {ranked.map((g) => (
          <AddOnRow key={g.titleId} summary={g} />
        ))}
      </CardContent>
    </Card>
  );
}
