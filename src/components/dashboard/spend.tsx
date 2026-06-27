import { Coins, Trophy, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type SpendSummary, summariseSpend } from "@/lib/psn/spend";
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

const STEPS = [
  "Drag the button below onto your bookmarks bar (or copy it and make a new bookmark).",
  "Open your PlayStation order/transaction history while signed in.",
  "Click the bookmark — it scrolls to load everything, then sends the data back here in one click.",
];

/** The draggable bookmarklet link plus a copy fallback. */
function BookmarkletActions() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Set the `javascript:` href imperatively: React strips it from JSX, and
    // this keeps SSR output free of the bookmarklet string.
    if (ref.current) ref.current.href = bookmarkletHref(window.location.origin);
  }, []);

  const copy = () => {
    void navigator.clipboard.writeText(bookmarkletHref(window.location.origin)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-3">
      {/* oxlint-disable-next-line react-doctor/nextjs-no-a-element, react-doctor/no-prevent-default -- draggable javascript: bookmarklet, not a navigation link */}
      <a
        ref={ref}
        href="/import"
        className="inline-flex h-9 cursor-grab items-center rounded-md border border-border bg-primary px-4 font-medium text-primary-foreground"
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
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
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
  if (!imported || imported.transactions.length === 0) {
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
