import { Banknote, Coins, ExternalLink, Gift, Trophy, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useCopied } from "@/components/dashboard/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  type AddOnSummary,
  type SpendSummary,
  summariseAddOns,
  summariseSpend,
  type TitleSpend,
} from "@/lib/psn/spend";
import { bookmarkletHref } from "@/lib/psn/transaction-bookmarklet";
import type { DashboardData } from "@/lib/psn/types";
import { useTransactionImport } from "@/lib/transactions-store";
import { fmtHours } from "./format";

function money(currency: string, value: number): string {
  const symbol = currency || "£";
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** £-per-hour, shown to the nearest penny. */
function perHour(currency: string, value: number): string {
  return `${money(currency, value)}/hr`;
}

function steps(
  canDragBookmarklet: boolean
): Array<{ text: ReactNode; href?: string; linkText?: string }> {
  return [
    {
      text: canDragBookmarklet
        ? "Drag the button below onto your bookmarks bar (or copy it and make a new bookmark)."
        : "Click Copy bookmark and save it as a new bookmark.",
    },
    {
      text: (
        <>
          Open PlayStation and make sure you are <strong>signed in</strong>.
        </>
      ),
      href: "https://www.playstation.com/en-gb/",
      linkText: "Open PlayStation",
    },
    {
      text: "Click the bookmark — it fetches your full purchase history and sends it back here in one click. No navigating or scrolling.",
    },
  ];
}

/** A numbered instruction step, mirroring the onboarding sign-in card. */
function Step({
  index,
  text,
  href,
  linkText,
}: ReturnType<typeof steps>[number] & { index: number }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index + 1}
      </span>
      <div className="space-y-1">
        <p>{text}</p>
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
function BookmarkletActions() {
  const [copied, flash] = useCopied();

  const copy = () => {
    void navigator.clipboard.writeText(bookmarkletHref(window.location.origin)).then(flash);
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
          if (el) el.href = bookmarkletHref(window.location.origin);
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

/** Prompt shown until the user imports their transaction history. */
function ImportSpendCard() {
  const canDragBookmarklet = !useMediaQuery("coarse-pointer");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4" /> Add your spend
        </CardTitle>
        <CardDescription>
          See £-per-hour value by importing your PlayStation transaction history. No file export,
          one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="space-y-3 text-muted-foreground">
          {steps(canDragBookmarklet).map((step, i) => (
            <Step key={step.linkText ?? i} index={i} {...step} />
          ))}
        </ol>
        <BookmarkletActions />
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

/**
 * Dashboard spend section. Shows the import prompt until transactions are
 * imported, then the spend-vs-playtime cards.
 */
export function SpendSection({ data }: { data: DashboardData }) {
  const imported = useTransactionImport();
  // Never join the user's real imported spend to the demo library — call the
  // hook unconditionally, then show the prompt for demo data or no import.
  if (data.isDemo || !imported || imported.transactions.length === 0) {
    return <ImportSpendCard />;
  }

  const summary = summariseSpend(data, imported.transactions);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TotalsCard summary={summary} />
      <ByYearCard summary={summary} />
      <LeaderboardCard summary={summary} />
    </div>
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
 * with no playtime. Hidden for the demo library and until a transaction import
 * lands, mirroring {@link SpendSection}.
 */
export function SpentMostSection({ data }: { data: DashboardData }) {
  const imported = useTransactionImport();
  if (data.isDemo || !imported || imported.transactions.length === 0) return null;

  const summary = summariseSpend(data, imported.transactions);
  if (summary.byTitle.length === 0) return null;

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
 * purchases. Hidden for the demo library and until a transaction import lands,
 * mirroring {@link SpendSection}.
 */
export function AddOnsSection({ data }: { data: DashboardData }) {
  const imported = useTransactionImport();
  if (data.isDemo || !imported || imported.transactions.length === 0) return null;

  const ranked = summariseAddOns(data, imported.transactions)
    .slice()
    .sort((a, b) => b.addOnCount - a.addOnCount || a.name.localeCompare(b.name))
    .slice(0, 10);
  if (ranked.length === 0) return null;

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
      <CardContent className="space-y-2 text-sm">
        {ranked.map((g) => (
          <AddOnRow key={g.titleId} summary={g} />
        ))}
      </CardContent>
    </Card>
  );
}
