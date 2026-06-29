import type { TransactionRow } from "@/domain/transactions";
import {
  bingeVsDipIn,
  genreBreakdown,
  headlineTotals,
  recency,
  topFranchises,
  valuePerGame,
} from "@/features/dashboard/filters/analytics";
import { fmtDate } from "@/features/dashboard/format";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import {
  ADD_ON_SIGNAL_GUIDANCE,
  COMPLETION_INTERPRETATION_GUIDANCE,
  MENU_INSTRUCTION,
  MENU_MODE,
  METRIC_GUIDANCE_CAVEAT,
  METRIC_RUBRIC_GROUPS,
  PLAY_PATTERN_GUIDANCE,
  PLAYTIME_SIGNAL_GUIDANCE,
  PRICE_CONTEXT_GUIDANCE,
  PROMPT_GROUPS,
  PROMPT_VARIANTS,
  SPEND_SIGNAL_GUIDANCE,
  SPEND_VARIANTS,
  TROPHY_SIGNAL_GUIDANCE,
  type PromptVariant,
} from "./llm-prompt-catalogue";
import {
  buildPromptTransactionContext,
  hasTransactionHistory,
  type PromptTransactionContext,
} from "./llm-transaction-context";
import type { SpendSummary } from "./spend";

function availableVariants(hasTransactions: boolean): readonly PromptVariant[] {
  return hasTransactions ? [...PROMPT_VARIANTS, ...SPEND_VARIANTS] : PROMPT_VARIANTS;
}

function gameTiming(g: GamePlay): string {
  const parts: string[] = [];
  if (g.lastPlayed) parts.push(`last played ${fmtDate(g.lastPlayed)}`);
  if (g.firstPlayed) parts.push(`first played ${fmtDate(g.firstPlayed)}`);
  return parts.length === 0 ? ", timing unknown" : `, ${parts.join(", ")}`;
}

function gameTrophy(g: GamePlay): string {
  const t = g.trophy;
  if (!t) return ", trophies unknown (no data)";
  const { platinum, gold, silver, bronze } = t.earned;
  const counts = `earned P${platinum}/G${gold}/S${silver}/B${bronze}`;
  const platinumStatus = !t.hasPlatinum
    ? "no platinum available"
    : platinum >= 1
      ? "platinum earned"
      : "platinum available, not earned";
  return `, trophies ${t.progress}% complete (${counts}), ${platinumStatus}`;
}

function gamePlaytime(g: GamePlay): string {
  if (g.typicalPlaytime === undefined) return "";
  const ratio = (g.hours / g.typicalPlaytime).toFixed(1);
  return `, you: ${Math.round(g.hours)}h lifetime vs typical ~${g.typicalPlaytime}h (~${ratio}x)`;
}

function gameAddOns(g: GamePlay, ctx: PromptTransactionContext): string {
  const count = ctx.addOnCounts.get(g.titleId) ?? 0;
  return count === 0 ? "" : `, add-ons purchased: ${count}`;
}

function fmtMoney(minor: number, currency: string): string {
  return `${currency}${(minor / 100).toFixed(2)}`;
}

function gamePriceContext(g: GamePlay, ctx: PromptTransactionContext): string {
  const price = ctx.priceContextByTitle.get(g.titleId);
  if (!price) return "";
  const paid = fmtMoney(price.paidMinor, price.currency);
  if (price.originalPriceMinor !== undefined && price.originalPriceMinor > price.paidMinor) {
    return `, bought: ${price.label} (${paid} of ${fmtMoney(price.originalPriceMinor, price.currency)})`;
  }
  return `, bought: ${price.label} (${paid})`;
}

function listGames(data: DashboardData, ctx: PromptTransactionContext): string {
  return data.games
    .toSorted((a, b) => b.hours - a.hours)
    .map((g, i) => {
      const franchise = g.franchise ? `, ${g.franchise}` : "";
      return `  ${i + 1}. ${g.name} — ${Math.round(g.hours)}h (${g.genre}${franchise})${gameTiming(g)}${gamePlaytime(g)}${gameTrophy(g)}${gameAddOns(g, ctx)}${gamePriceContext(g, ctx)}`;
    })
    .join("\n");
}

function listGenres(data: DashboardData): string {
  return genreBreakdown(data)
    .map((g) => `  - ${g.genre}: ${g.hours}h across ${g.games} games (${g.share}%)`)
    .join("\n");
}

function listFranchises(data: DashboardData): string {
  const franchises = topFranchises(data, data.games.length);
  if (franchises.length === 0) return "  (none detected)";
  return franchises
    .map((f) => `  - ${f.franchise}: ${f.hours}h across ${f.games} games`)
    .join("\n");
}

function listSessionStyle(data: DashboardData): string {
  return bingeVsDipIn(data, data.games.length)
    .map((s) => `  - ${s.name}: ${s.hoursPerSession}h/session over ${s.playCount} sessions`)
    .join("\n");
}

function completionistBaseline(data: DashboardData): string {
  const accountPlatinums = data.profile.earned.platinum;
  const eligible = data.games.filter((g) => g.trophy?.hasPlatinum === true);
  const platinumed = eligible.filter((g) => (g.trophy?.earned.platinum ?? 0) >= 1);
  const rate =
    eligible.length === 0
      ? "no platinum-eligible games with trophy data, so no rate"
      : `${Math.round((platinumed.length / eligible.length) * 100)}% platinum rate`;
  return `- Completionist baseline: ${accountPlatinums} platinums earned account-wide; platinumed ${platinumed.length} of ${eligible.length} platinum-eligible games with trophy data (${rate}).`;
}

function fmtMajor(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}

function spendByYearLine(s: SpendSummary): string {
  const years = s.byYear
    .map((y) => `${y.year} ${fmtMajor(y.spend, s.currency)} (${y.purchases} purchases)`)
    .join(", ");
  return `- Spend by year: ${years}`;
}

function costPerHourLines(s: SpendSummary): string {
  return [
    "- Cost per hour played (matched purchases, lowest first — total matched spend ÷ lifetime hours):",
    ...s.leaderboard.map(
      (l) =>
        `  - ${l.name}: ${fmtMajor(l.spend, s.currency)} over ${Math.round(l.hours)}h (${fmtMajor(l.perHour, s.currency)}/h)`
    ),
  ].join("\n");
}

function spendSummaryLines(ctx: PromptTransactionContext): string[] {
  const s = ctx.spend;
  if (!s) return [];
  const lines = [
    `- Spend (imported transaction history): ${fmtMajor(s.totalSpend, s.currency)} total across ${s.purchaseCount} purchases; wallet top-ups ${fmtMajor(s.topUpTotal, s.currency)}; ${s.paidGames} games matched to a purchase, ${s.freeGames} with no matched purchase (PS Plus / pre-installs / free / unmatched); ${fmtMajor(s.unmatchedSpend, s.currency)} of purchases matched no library title.`,
  ];
  if (s.byYear.length > 0) lines.push(spendByYearLine(s));
  if (s.leaderboard.length > 0) lines.push(costPerHourLines(s));
  return lines;
}

function transactionLines(ctx: PromptTransactionContext): string[] {
  if (!ctx.hasTransactions) return [];
  const lines: string[] = [];
  if (ctx.addOns.length > 0) {
    lines.push(
      "- Imported transaction signal: matched add-on purchases are listed per game as 'add-ons purchased'."
    );
  }
  if (ctx.priceContexts.length > 0) {
    lines.push(
      "- Imported transaction signal: matched purchase price/discount is listed per game as 'bought: <context>'."
    );
  }
  return lines;
}

function buildDataSummaryFromContext(data: DashboardData, ctx: PromptTransactionContext): string {
  const totals = headlineTotals(data);
  const value = valuePerGame(data);
  const r = recency(data);

  return [
    "DATA (my PlayStation playtime, lifetime totals):",
    "- Note: every hour below is what PSN has RECORDED for that game, which doesn't always reflect true time played — PSN can under-report or miss play time for some titles, so a low hour count can understate it and should not be read as low engagement. PSN reports no per-period or per-session playtime, so never read these as hours played within a specific window.",
    `- Totals: ${totals.gamesPlayed} games, ${totals.totalHours}h played, ${totals.sessions} sessions, PSN trophy level ${totals.trophyLevel}.`,
    `- Averages: ${value.avgHoursPerGame}h per game, ${value.avgSessionsPerGame} sessions per game, ${value.avgSessionLength}h per session.`,
    `- Recency (${r.thisYear}): ${r.activeGames} active games (${r.activeHours}h) vs ${r.dormantGames} dormant (${r.dormantHours}h).`,
    completionistBaseline(data),
    "- All games by hours (with when each was last/first played):",
    listGames(data, ctx),
    "- Genres by hours:",
    listGenres(data),
    "- Franchises by hours:",
    listFranchises(data),
    "- Session style (hours per session):",
    listSessionStyle(data),
    ...spendSummaryLines(ctx),
    ...transactionLines(ctx),
  ].join("\n");
}

export function buildDataSummary(
  data: DashboardData,
  transactions?: readonly TransactionRow[]
): string {
  return buildDataSummaryFromContext(data, buildPromptTransactionContext(data, transactions));
}

function buildFollowUpsFromContext(lead: PromptVariant, hasTransactions: boolean): string {
  const lines = [
    "FOLLOW-UP QUESTIONS — paste any of these into this chat afterwards; you already have my data above, so don't ask me to resend it:",
  ];
  for (const group of PROMPT_GROUPS) {
    const questions = availableVariants(hasTransactions).filter(
      (v) => v.group === group && v.id !== lead.id
    );
    if (questions.length === 0) continue;
    lines.push(`${group}:`);
    for (const v of questions) lines.push(`- ${v.question}`);
  }
  return lines.join("\n");
}

export function buildFollowUps(
  lead: PromptVariant,
  transactions?: readonly TransactionRow[]
): string {
  return buildFollowUpsFromContext(lead, hasTransactionHistory(transactions));
}

function menuInstruction(ctx: PromptTransactionContext): string {
  if (!ctx.hasTransactions) return MENU_INSTRUCTION;
  return MENU_INSTRUCTION.replace(
    "Recommendations, More)",
    "Recommendations, Spending & value, More)"
  );
}

function buildMenuFromContext(hasTransactions: boolean): string {
  const lines = ["MENU — the questions I could ask, grouped (pick one to start):"];
  for (const group of PROMPT_GROUPS) {
    const questions = availableVariants(hasTransactions).filter((v) => v.group === group);
    if (questions.length === 0) continue;
    lines.push(`${group}:`);
    for (const v of questions) lines.push(`- ${v.question}`);
  }
  return lines.join("\n");
}

export function buildMenu(transactions?: readonly TransactionRow[]): string {
  return buildMenuFromContext(hasTransactionHistory(transactions));
}

function metricGuidance(lead: PromptVariant, ctx: PromptTransactionContext): string[] {
  if (!METRIC_RUBRIC_GROUPS.has(lead.group)) return [];
  return [
    TROPHY_SIGNAL_GUIDANCE,
    PLAYTIME_SIGNAL_GUIDANCE,
    COMPLETION_INTERPRETATION_GUIDANCE,
    ...(ctx.addOns.length === 0 ? [] : [ADD_ON_SIGNAL_GUIDANCE]),
    ...(ctx.priceContexts.length === 0 ? [] : [PRICE_CONTEXT_GUIDANCE]),
    ...(ctx.hasTransactions ? [SPEND_SIGNAL_GUIDANCE] : []),
  ];
}

function buildMenuPrompt(data: DashboardData, ctx: PromptTransactionContext): string {
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "Weigh WHEN I played (recency and trends from each game's last/first played dates), not just total hours — a big total played years ago means something different from a smaller total I'm playing now.",
    METRIC_GUIDANCE_CAVEAT,
    PLAY_PATTERN_GUIDANCE,
    "",
    buildDataSummaryFromContext(data, ctx),
    "",
    menuInstruction(ctx),
    "",
    buildMenuFromContext(ctx.hasTransactions),
  ].join("\n");
}

export function buildPrompt(
  data: DashboardData,
  lead: PromptVariant | typeof MENU_MODE,
  transactions?: readonly TransactionRow[]
): string {
  const ctx = buildPromptTransactionContext(data, transactions);
  if (lead === MENU_MODE) return buildMenuPrompt(data, ctx);
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "Weigh WHEN I played (recency and trends from each game's last/first played dates), not just total hours — a big total played years ago means something different from a smaller total I'm playing now.",
    METRIC_GUIDANCE_CAVEAT,
    PLAY_PATTERN_GUIDANCE,
    ...metricGuidance(lead, ctx),
    "",
    buildDataSummaryFromContext(data, ctx),
    "",
    `TASK: ${lead.instruction}`,
    "",
    buildFollowUpsFromContext(lead, ctx.hasTransactions),
  ].join("\n");
}
