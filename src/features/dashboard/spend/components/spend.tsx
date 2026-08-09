import { ExternalLink, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bookmarkletHref } from "@/domain/transaction-bookmarklet";
import type { TransactionRow } from "@/domain/transactions";
import { useCopied } from "@/features/dashboard/components/copy-button";
import { fmtHours, fmtNumber } from "@/features/dashboard/format";
import {
  type AddOnSummary,
  type SpendSummary,
  isAddOnPurchase,
  summariseAddOns,
  summariseSpend,
  type TitleSpend,
} from "@/features/dashboard/spend/spend";
import { GamePoster } from "@/features/prototype/poster";
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
        <Info className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverTitle>Why an import step is needed</PopoverTitle>
        <PopoverDescription>{whyImportNeeded}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

function PurchaseImportHeader({
  data,
  transactionCount,
}: {
  data: DashboardData;
  transactionCount: number;
}) {
  const transactionLabel = transactionCount === 1 ? "transaction" : "transactions";
  const status =
    transactionCount === 0
      ? `No imported transactions for ${data.profile.onlineId} yet.`
      : `${fmtNumber(transactionCount)} imported ${transactionLabel} for ${data.profile.onlineId}. Run the bookmarklet again whenever you want to update them.`;
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        Import PlayStation purchases
        <WhyImportInfo />
      </CardTitle>
      <CardDescription>{status}</CardDescription>
    </CardHeader>
  );
}

function PurchaseImport({
  data,
  transactionCount,
}: {
  data: DashboardData;
  transactionCount: number;
}) {
  return (
    <Card>
      <PurchaseImportHeader data={data} transactionCount={transactionCount} />
      <CardContent>
        <ImportInstructions accountId={data.profile.accountId} onlineId={data.profile.onlineId} />
      </CardContent>
    </Card>
  );
}

function SpendMetric({
  label,
  value,
  detail,
  divided = false,
}: {
  label: string;
  value: string;
  detail: string;
  divided?: boolean;
}) {
  return (
    <div
      className={`playloom-metric flex min-w-0 flex-col gap-[5px] py-[22px] pr-[18px] max-sm:py-[18px] max-sm:pr-3 ${divided ? "border-l border-[var(--playloom-rule)] pl-[18px] max-sm:pl-3" : "pl-0"}`}
    >
      <span className="text-[9px] font-bold tracking-[0.08em] text-[#666a70] uppercase">
        {label}
      </span>
      <strong className="overflow-hidden font-[Fraunces_Variable] text-[clamp(22px,3vw,36px)] font-semibold tracking-[-0.035em] text-ellipsis tabular-nums">
        {value}
      </strong>
      <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[#707379]">
        {detail}
      </small>
    </div>
  );
}

function SpendMetrics({ summary, discounts }: { summary: SpendSummary; discounts: number }) {
  const average =
    summary.purchaseCount === 0
      ? "—"
      : money(summary.currency, summary.totalSpend / summary.purchaseCount);
  return (
    <div className="playloom-metric-strip playloom-spend-strip">
      <SpendMetric
        label="Total spend"
        value={money(summary.currency, summary.totalSpend)}
        detail={`${summary.purchaseCount} purchases`}
      />
      <SpendMetric
        divided
        label="Matched spend"
        value={money(summary.currency, summary.totalSpend - summary.unmatchedSpend)}
        detail={`${summary.paidGames} paid · ${summary.freeGames} free / included`}
      />
      <SpendMetric
        divided
        label="Unmatched"
        value={money(summary.currency, summary.unmatchedSpend)}
        detail="Subscriptions and unknowns"
      />
      <SpendMetric divided label="Average paid" value={average} detail="Per purchase line" />
      <SpendMetric
        divided
        label="Discounts"
        value={money(summary.currency, discounts)}
        detail="Saved from original prices"
      />
    </div>
  );
}

function SpendYears({ summary }: { summary: SpendSummary }) {
  const max = Math.max(...summary.byYear.map((y) => y.spend), 1);
  return (
    <div className="playloom-spend-years">
      <h4>Spend by year</h4>
      {summary.byYear.length === 0 ? (
        <p className="border-y border-[var(--playloom-rule)] py-4 text-sm text-muted-foreground">
          No dated purchase spend is available yet.
        </p>
      ) : (
        summary.byYear.map((year) => (
          <div key={year.year}>
            <span>{year.year}</span>
            <div className="playloom-bar" aria-hidden="true">
              <i style={{ width: `${(year.spend / max) * 100}%` }} />
            </div>
            <strong>{money(summary.currency, year.spend)}</strong>
            <small>{year.purchases} purchases</small>
          </div>
        ))
      )}
    </div>
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
    <div className="flex items-center justify-between gap-3 border-t border-[var(--playloom-rule)] py-3 last:border-b">
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
    <div className="mt-3 flex items-center justify-between border-l-2 border-[var(--playloom-rule-strong)] pl-3 text-xs text-muted-foreground">
      <span>Spend not matched to a played title</span>
      <span className="tabular-nums">{money(currency, spend)}</span>
    </div>
  );
}

function ValueRanking({ summary }: { summary: SpendSummary }) {
  const top = summary.leaderboard.slice(0, 10);
  return (
    <div>
      <h4 className="playloom-subheading">Best value per hour</h4>
      <p className="mb-4 max-w-[68ch] text-sm text-muted-foreground">
        What each paid game cost per hour played. Lowest is best value.
      </p>
      {top.length === 0 ? (
        <p className="border-y border-[var(--playloom-rule)] py-4 text-sm text-muted-foreground">
          No matched purchases with playtime are available yet.
        </p>
      ) : (
        top.map((g) => <LeaderRow key={g.titleId} currency={summary.currency} leader={g} />)
      )}
      <UnmatchedFooter currency={summary.currency} spend={summary.unmatchedSpend} />
    </div>
  );
}

interface TransactionSectionProps {
  data: DashboardData;
  transactions?: TransactionRow[];
}

interface SpendingSummaryProps extends TransactionSectionProps {
  unavailableMessage?: string;
}

function useSectionTransactions(data: DashboardData, transactions?: TransactionRow[]) {
  const imported = useTransactionImport(data.profile.accountId);
  if (transactions) return transactions;
  return imported?.transactions ?? [];
}

/** Account-scoped purchase import procedure, kept separate from spend insights and data tools. */
export function SpendSection({ data, transactions }: TransactionSectionProps) {
  const rows = useSectionTransactions(data, transactions);
  return <PurchaseImport data={data} transactionCount={rows.length} />;
}

export function SpendingSummary({ data, transactions, unavailableMessage }: SpendingSummaryProps) {
  const rows = useSectionTransactions(data, transactions);
  if (rows.length === 0) {
    const title =
      unavailableMessage === undefined
        ? "No spending summary yet"
        : "Purchase transactions unavailable";
    const message =
      unavailableMessage ??
      "No imported purchase history is available for this account. Purchase destinations remain available below.";
    return <EmptySpendState title={title}>{message}</EmptySpendState>;
  }
  const summary = summariseSpend(data, rows);
  const discounts = rows.reduce((total, row) => total + (row.discountMinor ?? 0) / 100, 0);
  return (
    <div className="space-y-10">
      <SpendMetrics summary={summary} discounts={discounts} />
      <p className="playloom-spend-topups">
        Wallet top-ups: <strong>{money(summary.currency, summary.topUpTotal)}</strong> · shown
        separately from spend
      </p>
      <SpendYears summary={summary} />
      <ValueRanking summary={summary} />
      <p className="playloom-caveat">
        Transactions are matched to played titles by stable SKU where available, then validated
        title matching. Unmatched spend stays visible rather than being guessed.
      </p>
    </div>
  );
}

function EmptySpendState({ title, children }: { title: string; children: string }) {
  return (
    <div className="border-y border-[var(--playloom-rule)] py-6 text-sm">
      <strong>{title}</strong>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </div>
  );
}

function titlePresentation(data: DashboardData, transactions: TransactionRow[], title: TitleSpend) {
  const game = data.games.find((candidate) => candidate.titleId === title.titleId);
  const rows = game
    ? transactions.filter(
        (row) =>
          row.skuId?.includes(game.titleId) ||
          row.productName.toLowerCase().includes(game.name.toLowerCase())
      )
    : [];
  const addOns = rows
    .filter((row) => isAddOnPurchase(row, game))
    .reduce((total, row) => total + row.amountMinor / 100, 0);
  return { game, addOns, base: title.spend - addOns };
}

function MostSpentRow({
  data,
  transactions,
  title,
  rank,
  max,
  currency,
}: {
  data: DashboardData;
  transactions: TransactionRow[];
  title: TitleSpend;
  rank: number;
  max: number;
  currency: string;
}) {
  const detail = titlePresentation(data, transactions, title);
  return (
    <div className={`playloom-ranked-game ${rank === 0 ? "is-featured" : ""}`}>
      <span className="playloom-rank">{String(rank + 1).padStart(2, "0")}</span>
      {detail.game ? <GamePoster game={detail.game} featured={rank === 0} /> : <span />}
      <span className="playloom-ranked-copy">
        <strong>{title.name}</strong>
        <span>
          Base {money(currency, detail.base)} · Add-ons {money(currency, detail.addOns)}
        </span>
        <span className="playloom-bar" aria-hidden="true">
          <i style={{ width: `${(title.spend / max) * 100}%` }} />
        </span>
      </span>
      <b>{money(currency, title.spend)}</b>
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
      <EmptySpendState title="No most-spent ranking yet">
        Import purchase transactions to see which games received the most spending.
      </EmptySpendState>
    );
  }

  const summary = summariseSpend(data, rows);
  if (summary.byTitle.length === 0) {
    return (
      <EmptySpendState title="No matched game spending">
        Imported purchases could not be matched to games in this archive.
      </EmptySpendState>
    );
  }

  const max = Math.max(...summary.byTitle.map((title) => title.spend), 1);
  return (
    <div>
      <p className="mb-5 max-w-[68ch] text-sm text-muted-foreground">
        Games ranked by total account spend, with base purchases and add-ons kept visible.
      </p>
      <div className="playloom-ranked-list">
        {summary.byTitle.map((title, rank) => (
          <MostSpentRow
            key={title.titleId}
            data={data}
            transactions={rows}
            title={title}
            rank={rank}
            max={max}
            currency={summary.currency}
          />
        ))}
      </div>
    </div>
  );
}

function AddOnRow({ data, summary }: { data: DashboardData; summary: AddOnSummary }) {
  const game = data.games.find((candidate) => candidate.titleId === summary.titleId);
  const label = summary.addOnCount === 1 ? "add-on purchase" : "add-on purchases";
  return (
    <div className="playloom-addon">
      {game ? <GamePoster game={game} /> : <span />}
      <span>
        <strong>{summary.name}</strong>
        <small>
          {summary.addOnCount} {label}
        </small>
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
      <EmptySpendState title="No add-on purchases yet">
        Import purchase transactions to see add-ons matched to games in this archive.
      </EmptySpendState>
    );
  }

  const ranked = summariseAddOns(data, rows)
    .slice()
    .sort((a, b) => b.addOnCount - a.addOnCount || a.name.localeCompare(b.name));
  if (ranked.length === 0) {
    return (
      <EmptySpendState title="No matched add-ons">
        The imported purchase history has no add-ons matched to games in this archive.
      </EmptySpendState>
    );
  }

  return (
    <div>
      <p className="mb-5 max-w-[68ch] text-sm text-muted-foreground">
        Cover-led list of games with DLC, expansions or in-game items, ranked by purchase count.
      </p>
      <div>
        {ranked.map((summary) => (
          <AddOnRow key={summary.titleId} data={data} summary={summary} />
        ))}
      </div>
    </div>
  );
}
