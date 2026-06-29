/**
 * Build a ready-to-paste LLM prompt from a `DashboardData`.
 *
 * The prompt embeds the SAME compact, structured summary of the player's
 * library (totals, every game, genres, franchises, recency, session style)
 * exactly ONCE, leads with one strong analysis instruction, and ends with a
 * curated menu of the remaining questions as paste-able follow-ups. The model
 * already has the data in context, so a follow-up never has to re-send it.
 *
 * The summary is derived entirely from the existing `analytics.ts` selectors —
 * nothing here recomputes or duplicates that logic.
 */
import { fmtDate } from "@/components/dashboard/format";
import {
  bingeVsDipIn,
  genreBreakdown,
  headlineTotals,
  recency,
  topFranchises,
  valuePerGame,
} from "./analytics";
import type { DashboardData, GamePlay } from "./contract.schema";
import {
  summariseAddOns,
  summarisePriceContext,
  summariseSpend,
  type PriceContextSummary,
  type SpendSummary,
} from "./spend";
import type { TransactionRow } from "./transactions";

/** The category a question belongs to, used to group the selector and follow-ups. */
export type PromptGroup =
  | "Engagement & enjoyment"
  | "Completion & habits"
  | "Taste & preferences"
  | "Recommendations"
  | "Profile & personality"
  | "Spending & value"
  | "More";

/** Display order for the groups in both the selector and the follow-up menu. */
export const PROMPT_GROUPS = [
  "Engagement & enjoyment",
  "Completion & habits",
  "Taste & preferences",
  "Recommendations",
  "Profile & personality",
  "Spending & value",
  "More",
] as const satisfies readonly PromptGroup[];

/** A selectable question the user can lead their prompt with. */
export interface PromptVariant {
  id: string;
  /** Category used to group the selector and the follow-up menu. */
  group: PromptGroup;
  /** The natural-language question, shown in the selector and pasted as a follow-up. */
  question: string;
  /** The strong opening analysis instruction embedded after the data summary. */
  instruction: string;
}

/**
 * Every question on offer, all grounded in data we actually have (lifetime
 * hours, sessions, first/last played, genre, franchise, trophy completion %,
 * session-length signal). Each shares the one embedded data summary; whichever
 * is selected leads the prompt and the rest become paste-able follow-ups.
 */
export const PROMPT_VARIANTS = [
  {
    id: "enjoyment-vs-time",
    group: "Engagement & enjoyment",
    question: "Which games gave me the most enjoyment relative to time played?",
    instruction:
      "Work out which games gave me the most enjoyment relative to the time I put in. Weigh hours, number of sessions and how recently I kept coming back, and call out the titles that clearly punched above their playtime.",
  },
  {
    id: "engaging-genres",
    group: "Engagement & enjoyment",
    question: "Which genres keep me engaged the longest?",
    instruction:
      "Tell me which genres keep me engaged the longest. Use my hours, session counts and how long each genre stays in rotation to rank them, and explain what keeps me hooked.",
  },
  {
    id: "lost-interest-fastest",
    group: "Engagement & enjoyment",
    question: "Which games lost my interest the fastest?",
    instruction:
      "Identify the games that lost my interest the fastest. Look for titles with few sessions, low hours and a short gap between first and last played, and describe what they have in common.",
  },
  {
    id: "session-balance",
    group: "Engagement & enjoyment",
    question: "Which games have the healthiest balance of session length and consistency?",
    instruction:
      "Find the games with the healthiest balance of session length and consistency. Use my hours-per-session and how steadily I returned to them, and explain why that balance is healthy.",
  },
  {
    id: "mechanics-return",
    group: "Engagement & enjoyment",
    question: "Which mechanics seem to keep me coming back?",
    instruction:
      "Infer which game mechanics seem to keep me coming back. Reason from the genres, franchises and the titles I sink repeated sessions into, and name the recurring mechanics.",
  },
  {
    id: "finish-vs-abandon",
    group: "Completion & habits",
    question: "What patterns separate the games I finish from the ones I abandon?",
    instruction:
      "Work out what patterns separate the games I finish from the ones I abandon. Compare trophy completion against hours, session counts and recency, and describe the difference.",
  },
  {
    id: "typical-completion",
    group: "Completion & habits",
    question: "What completion rate is typical for games I truly enjoy?",
    instruction:
      "Estimate what trophy completion rate is typical for the games I truly enjoy. Use my highest-engagement titles as the sample and report the pattern you see.",
  },
  {
    id: "time-no-progress",
    group: "Completion & habits",
    question: "Which games did I spend a lot of time in without making much progress?",
    instruction:
      "Point out the games where I spent a lot of hours without making much trophy progress. List them and suggest why the time didn't convert into completion.",
  },
  {
    id: "finishing-blockers",
    group: "Completion & habits",
    question: "What habits are preventing me from finishing more games?",
    instruction:
      "Diagnose the habits that are stopping me from finishing more games. Use my session style, abandonment patterns and how spread my hours are, and give concrete, honest observations.",
  },
  {
    id: "hidden-preferences",
    group: "Taste & preferences",
    question: "What hidden preferences can you infer from my play history?",
    instruction:
      "Infer the hidden preferences in my play history — the patterns I might not notice myself. Back each inference with specific games, genres or franchises from the data.",
  },
  {
    id: "taste-over-time",
    group: "Taste & preferences",
    question: "How has my taste in games changed over time?",
    instruction:
      "Describe how my taste in games has changed over time. Compare my older last-played titles against my recent ones and trace the shift in genres and franchises.",
  },
  {
    id: "consistent-franchises",
    group: "Taste & preferences",
    question: "Which franchises consistently match my preferences?",
    instruction:
      "Tell me which franchises consistently match my preferences. Rank them by hours, number of titles and how reliably I return, and explain the consistency.",
  },
  {
    id: "outliers",
    group: "Taste & preferences",
    question: "Which games were outliers compared to the rest of my library?",
    instruction:
      "Find the games that were outliers compared to the rest of my library. Flag titles that break my usual genre, franchise, hours or session patterns and say what makes each unusual.",
  },
  {
    id: "another-chance",
    group: "Recommendations",
    question: "Which games deserve another chance based on my past behaviour?",
    instruction:
      "Recommend which games in my library deserve another chance based on my past behaviour. Favour good-fit titles I under-played or drifted away from, and justify each pick.",
  },
  {
    id: "one-backlog-pick",
    group: "Recommendations",
    question: "If you had to recommend one game from my backlog, which would it be and why?",
    instruction:
      "If you had to recommend exactly one game from my backlog (low-hours titles that fit my taste), pick one and explain in detail why it's the best next play for me.",
  },
  {
    id: "personality-traits",
    group: "Profile & personality",
    question: "What personality traits can you infer from my gaming habits?",
    instruction:
      "Infer the personality traits suggested by my gaming habits. Tie each trait to concrete evidence in my genres, franchises, session style and completion patterns.",
  },
  {
    id: "profile-paragraph",
    group: "Profile & personality",
    question: "How would you describe my gaming profile in one paragraph?",
    instruction:
      "Describe my gaming profile in one vivid paragraph, grounded in my biggest games, favourite genres, session style and recency.",
  },
  {
    id: "someone-else",
    group: "Profile & personality",
    question: "If my play history belonged to someone else, what would stand out most?",
    instruction:
      "Imagine my play history belonged to a stranger. Tell me what would stand out most about them, citing the specific games and patterns that jump out.",
  },
  {
    id: "binge-vs-steady",
    group: "More",
    question: "Which games did I binge in a short burst vs play steadily over a long time?",
    instruction:
      "Separate the games I binged in a short burst from the ones I played steadily over a long time. Use hours-per-session, session counts and the gap between first and last played.",
  },
  {
    id: "revivals",
    group: "More",
    question:
      "Which older games have I returned to recently (revivals), and which have I clearly moved on from?",
    instruction:
      "Identify my revivals — older games I've returned to recently — versus the ones I've clearly moved on from. Use each game's first and last played dates against its hours.",
  },
  {
    id: "under-explored-genre",
    group: "More",
    question:
      "Based on my genres and franchises, which genre have I under-explored that I'd probably enjoy?",
    instruction:
      "Based on my genres and franchises, name a genre I've under-explored that I'd probably enjoy, and suggest specific titles to start with.",
  },
  {
    id: "efficient-completionist",
    group: "More",
    question:
      "Which games have the best trophy completion relative to hours (efficient completionist)?",
    instruction:
      "Rank the games where I earned the best trophy completion relative to hours played — my most efficient completions — and describe what that says about how I play them.",
  },
  {
    id: "signature-genre",
    group: "More",
    question: "What's my signature genre, and how dominant is it versus everything else?",
    instruction:
      "Tell me my signature genre and how dominant it is versus everything else. Use the genre share of hours and games, and quantify the gap to the runner-up.",
  },
  {
    id: "last-12-months",
    group: "More",
    question: "Summarise my last ~12 months of gaming versus the year before.",
    instruction:
      "Summarise my last ~12 months of gaming versus the year before, using each game's last-played date. Call out what changed in genres, franchises and intensity.",
  },
  {
    id: "comfort-vs-one-and-done",
    group: "More",
    question: 'Which games are "comfort" titles I keep returning to versus one-and-done?',
    instruction:
      "Separate my comfort titles — the ones I keep returning to over a long span — from the one-and-done games. Use session counts and the first-to-last-played span.",
  },
  {
    id: "top-10-ranking",
    group: "More",
    question: "Rank my top 10 by hours and tell me what that ranking reveals about me.",
    instruction:
      "Rank my top 10 games by hours and tell me what that ranking reveals about me — the genres, franchises and play style it points to.",
  },
] as const satisfies readonly PromptVariant[];

/**
 * Spend/purchase questions, kept SEPARATE from {@link PROMPT_VARIANTS} because
 * they only make sense once transaction history is imported. They are folded
 * into the menu and follow-ups (and gain the spend data block + guidance) only
 * when transactions are present — see {@link availableVariants}. Each treats
 * spend as a SUPPORTING context/intent signal, never an enjoyment verdict, and
 * leaves every value-for-money judgement to the model rather than to code.
 */
export const SPEND_VARIANTS = [
  {
    id: "spend-over-time",
    group: "Spending & value",
    question: "How has my spending on games changed over time?",
    instruction:
      "Using the imported spend block, describe how my spending has changed over time — lean on the spend-by-year figures and the total, and call out my busiest and quietest spending periods. Treat spend as context about my buying habits, not a measure of enjoyment.",
  },
  {
    id: "cost-per-hour",
    group: "Spending & value",
    question: "Which games were the most and least expensive per hour I played?",
    instruction:
      "Rank my games by cost per hour played (matched spend ÷ lifetime hours) and call out the most and least expensive per hour. Read cost per hour as plain economics — hours per pound, not proof of enjoyment — and note where missing spend or very low hours make the figure unreliable.",
  },
  {
    id: "full-price-vs-sale",
    group: "Spending & value",
    question: "Which games did I buy at full price versus on a deep sale?",
    instruction:
      "Group my purchases by what I paid versus the original price — full-price or early buys against discounted and deep-sale ones — using each game's 'bought:' context. Read this as a signal of hype, patience and price-sensitivity, never as higher or lower enjoyment.",
  },
  {
    id: "add-on-spend",
    group: "Spending & value",
    question: "Where did my DLC and add-on spending go?",
    instruction:
      "Point out which games I invested in beyond the base game through DLC and add-ons, using the per-game add-on counts. Treat extra spend as a SUPPORTING commitment signal that only suggests enjoyment when playtime, recency or trophies agree.",
  },
  {
    id: "wallet-top-ups",
    group: "Spending & value",
    question: "How much did I top up my wallet versus spend on games?",
    instruction:
      "Compare my wallet top-ups against my actual game spend from the imported spend block. Be clear that top-ups fund the wallet and are not spend on any one game, and that unmatched or free titles are unknown spend, not zero.",
  },
  {
    id: "value-for-money",
    group: "Spending & value",
    question: "Which games gave me the best and worst value for money?",
    instruction:
      "Weigh what I paid for each game against how much I played it (and, where known, recency and trophies) to judge which gave the best and worst value for money. Reason about value yourself from the spend and playtime figures — there is no value score in the data — and flag games where missing spend makes the call uncertain.",
  },
] as const satisfies readonly PromptVariant[];

/**
 * Every question on offer for the current prompt: the always-available
 * {@link PROMPT_VARIANTS} plus the {@link SPEND_VARIANTS} only when transaction
 * history is imported (so spend questions never surface without the spend data
 * to answer them).
 */
function availableVariants(transactions?: readonly TransactionRow[]): readonly PromptVariant[] {
  return transactions && transactions.length > 0
    ? [...PROMPT_VARIANTS, ...SPEND_VARIANTS]
    : PROMPT_VARIANTS;
}

/** Compact "last/first played" timing, omitting dates that are unknown. */
function gameTiming(g: GamePlay): string {
  const parts: string[] = [];
  if (g.lastPlayed) parts.push(`last played ${fmtDate(g.lastPlayed)}`);
  if (g.firstPlayed) parts.push(`first played ${fmtDate(g.firstPlayed)}`);
  return parts.length === 0 ? ", timing unknown" : `, ${parts.join(", ")}`;
}

/**
 * Compact trophy signal for one game: completion %, earned counts and whether a
 * platinum was earned / is even available. Missing trophy data is surfaced as
 * UNKNOWN (not zero) so the model never reads a gap as low engagement.
 */
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

/**
 * Compact comparison of my lifetime hours against RAWG's typical time-to-complete,
 * surfaced only when RAWG reports a usable average (it is frequently 0/absent).
 * A ratio well above 1 is a SOFT enjoyment signal — see `PLAYTIME_SIGNAL_GUIDANCE`.
 */
function gamePlaytime(g: GamePlay): string {
  if (g.typicalPlaytime === undefined) return "";
  const ratio = (g.hours / g.typicalPlaytime).toFixed(1);
  return `, you: ${Math.round(g.hours)}h lifetime vs typical ~${g.typicalPlaytime}h (~${ratio}x)`;
}

function gameAddOns(g: GamePlay, addOnCounts: ReadonlyMap<string, number>): string {
  const count = addOnCounts.get(g.titleId) ?? 0;
  return count === 0 ? "" : `, add-ons purchased: ${count}`;
}

/** Format a minor-unit amount with its currency symbol, e.g. "£3.74". */
function fmtMoney(minor: number, currency: string): string {
  return `${currency}${(minor / 100).toFixed(2)}`;
}

/**
 * Compact per-game purchase-price context (e.g. ", bought: deep-sale (£3.74 of
 * £44.99)"), surfaced only when imported spend matched the base game. The
 * original price is shown when known; otherwise just the amount paid. A SUPPORTING
 * intent signal — see `PRICE_CONTEXT_GUIDANCE`.
 */
function gamePriceContext(
  g: GamePlay,
  priceContexts: ReadonlyMap<string, PriceContextSummary>
): string {
  const ctx = priceContexts.get(g.titleId);
  if (!ctx) return "";
  const paid = fmtMoney(ctx.paidMinor, ctx.currency);
  if (ctx.originalPriceMinor !== undefined && ctx.originalPriceMinor > ctx.paidMinor) {
    return `, bought: ${ctx.label} (${paid} of ${fmtMoney(ctx.originalPriceMinor, ctx.currency)})`;
  }
  return `, bought: ${ctx.label} (${paid})`;
}

/**
 * Every game, biggest first, with its hours, genre, franchise and when it was
 * last (and first) played so recency can be weighed against raw hours.
 */
function listGames(
  data: DashboardData,
  addOnCounts: ReadonlyMap<string, number>,
  priceContexts: ReadonlyMap<string, PriceContextSummary>
): string {
  return data.games
    .toSorted((a, b) => b.hours - a.hours)
    .map((g, i) => {
      const franchise = g.franchise ? `, ${g.franchise}` : "";
      return `  ${i + 1}. ${g.name} — ${Math.round(g.hours)}h (${g.genre}${franchise})${gameTiming(g)}${gamePlaytime(g)}${gameTrophy(g)}${gameAddOns(g, addOnCounts)}${gamePriceContext(g, priceContexts)}`;
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

/**
 * The completionist baseline: total platinums earned account-wide plus the rate
 * at which platinum-eligible games (those with trophy data and a platinum on
 * offer) were actually platinumed. This gives the model a yardstick for how
 * much weight a single platinum should carry. Games without trophy data are
 * excluded from the rate (unknown, not zero), and the rate degrades gracefully
 * when no game has a platinum available.
 */
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

/** Format a major-unit amount with its currency symbol, e.g. "£44.99". */
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

/**
 * The imported-spend data block: account-wide totals, wallet top-ups, matched
 * vs unmatched coverage, spend per year and cost per hour played — all factual
 * figures from {@link summariseSpend}, with no value judgement baked in (that is
 * left to the model, see {@link SPEND_SIGNAL_GUIDANCE}). Present only when
 * transaction history is imported.
 */
function spendSummaryLines(
  data: DashboardData,
  transactions?: readonly TransactionRow[]
): string[] {
  if (!transactions || transactions.length === 0) return [];
  const s = summariseSpend(data, [...transactions]);
  const lines = [
    `- Spend (imported transaction history): ${fmtMajor(s.totalSpend, s.currency)} total across ${s.purchaseCount} purchases; wallet top-ups ${fmtMajor(s.topUpTotal, s.currency)}; ${s.paidGames} games matched to a purchase, ${s.freeGames} with no matched purchase (PS Plus / pre-installs / free / unmatched); ${fmtMajor(s.unmatchedSpend, s.currency)} of purchases matched no library title.`,
  ];
  if (s.byYear.length > 0) lines.push(spendByYearLine(s));
  if (s.leaderboard.length > 0) lines.push(costPerHourLines(s));
  return lines;
}

function transactionLines(data: DashboardData, transactions?: readonly TransactionRow[]): string[] {
  if (!transactions || transactions.length === 0) return [];
  const lines: string[] = [];
  if (summariseAddOns(data, transactions).length > 0) {
    lines.push(
      "- Imported transaction signal: matched add-on purchases are listed per game as 'add-ons purchased'."
    );
  }
  if (summarisePriceContext(data, transactions).length > 0) {
    lines.push(
      "- Imported transaction signal: matched purchase price/discount is listed per game as 'bought: <context>'."
    );
  }
  return lines;
}

/** The compact, structured data summary embedded once in every prompt. */
export function buildDataSummary(
  data: DashboardData,
  transactions?: readonly TransactionRow[]
): string {
  const totals = headlineTotals(data);
  const value = valuePerGame(data);
  const r = recency(data);
  const addOnCounts = new Map(
    transactions?.length
      ? summariseAddOns(data, transactions).map((g) => [g.titleId, g.addOnCount])
      : []
  );
  const priceContexts = new Map<string, PriceContextSummary>(
    transactions?.length ? summarisePriceContext(data, transactions).map((c) => [c.titleId, c]) : []
  );

  return [
    "DATA (my PlayStation playtime, lifetime totals):",
    "- Note: every hour below is what PSN has RECORDED for that game, which doesn't always reflect true time played — PSN can under-report or miss play time for some titles, so a low hour count can understate it and should not be read as low engagement. PSN reports no per-period or per-session playtime, so never read these as hours played within a specific window.",
    `- Totals: ${totals.gamesPlayed} games, ${totals.totalHours}h played, ${totals.sessions} sessions, PSN trophy level ${totals.trophyLevel}.`,
    `- Averages: ${value.avgHoursPerGame}h per game, ${value.avgSessionsPerGame} sessions per game, ${value.avgSessionLength}h per session.`,
    `- Recency (${r.thisYear}): ${r.activeGames} active games (${r.activeHours}h) vs ${r.dormantGames} dormant (${r.dormantHours}h).`,
    completionistBaseline(data),
    "- All games by hours (with when each was last/first played):",
    listGames(data, addOnCounts, priceContexts),
    "- Genres by hours:",
    listGenres(data),
    "- Franchises by hours:",
    listFranchises(data),
    "- Session style (hours per session):",
    listSessionStyle(data),
    ...spendSummaryLines(data, transactions),
    ...transactionLines(data, transactions),
  ].join("\n");
}

/**
 * The curated follow-up menu: every question EXCEPT the lead, grouped by
 * category, phrased so the user can paste any of them straight into the ongoing
 * chat without re-sending the data.
 */
export function buildFollowUps(
  lead: PromptVariant,
  transactions?: readonly TransactionRow[]
): string {
  const variants = availableVariants(transactions);
  const lines = [
    "FOLLOW-UP QUESTIONS — paste any of these into this chat afterwards; you already have my data above, so don't ask me to resend it:",
  ];
  for (const group of PROMPT_GROUPS) {
    const questions = variants.filter((v) => v.group === group && v.id !== lead.id);
    if (questions.length === 0) continue;
    lines.push(`${group}:`);
    for (const v of questions) lines.push(`- ${v.question}`);
  }
  return lines.join("\n");
}

/**
 * Guidance telling the model to read session-length / session-count patterns
 * RELATIVE to each game's listed genre, since the same raw pattern means
 * opposite things across genres. Concrete calibration only — the model still
 * weighs it against the data and reaches its own verdict.
 */
export const PLAY_PATTERN_GUIDANCE = [
  "Interpret session-length and session-count patterns RELATIVE to each game's listed genre/design — the same raw pattern means opposite things across genres, so never read short or repeated sessions as (dis)enjoyment without weighing the genre:",
  "- Roguelike / soulslike / fighting / sports / arcade: short, repeated sessions ARE the core loop and signal engagement, not frustration (e.g. lots of short runs in a punishing fighter is the design, not dislike).",
  "- Narrative / RPG / adventure: long contiguous sessions are expected; many tiny sessions may instead indicate bounce-off.",
  "- Live-service / multiplayer: session cadence reflects habit, not completion or enjoyment.",
  "Treat this as calibration to weigh against each game's genre, not a fixed per-genre verdict.",
].join("\n");

/**
 * Guidance telling the model to read a platinum / high trophy count as an
 * enjoyment signal whose STRENGTH is relative to my completionist baseline,
 * while honouring the data-gap, no-platinum-available and difficulty caveats.
 * Calibration only — the model still weighs it against the data and decides.
 */
export const TROPHY_SIGNAL_GUIDANCE = [
  "Read platinum and high trophy counts as an enjoyment/commitment signal, but weight each one RELATIVE to my completionist baseline above (how often I platinum games that allow it):",
  "- A platinum from a low-baseline player (someone who rarely platinums) is a STRONG signal of enjoyment and investment in that title.",
  "- For a habitual platinum-hunter (high baseline) a platinum is expected and discriminates far less, so weight it down.",
  "- High trophy counts or completion % short of a platinum are a SOFTER version of the same signal — read them the same baseline-relative way.",
  "Honour these caveats and never overclaim:",
  "- 'trophies unknown (no data)' means UNKNOWN, NOT zero — never infer dislike or low engagement from missing trophy data.",
  "- 'no platinum available' (common for multiplayer/older titles) is NOT a negative signal; the absence of a platinum there says nothing about enjoyment.",
  "- I have no trophy-difficulty data, so don't assume a platinum was hard or easy; the baseline-relative framing is what gives a platinum its weight.",
].join("\n");

/**
 * Guidance telling the model to read a "you: Xh lifetime vs typical ~Yh (~Nx)"
 * line as a SOFT enjoyment signal — spending far longer than typical suggests
 * engagement — while honouring that RAWG's average is rough and that lifetime
 * totals make the ratio meaningless for live-service / multiplayer games.
 */
export const PLAYTIME_SIGNAL_GUIDANCE = [
  "When a game's line shows 'you: Xh lifetime vs typical ~Yh (~Nx)', read a ratio well above 1 (much longer than typical) as a SOFT enjoyment/engagement signal, weighed ALONGSIDE hours, recency and trophies — never as a primary metric:",
  "- 'typical' is RAWG's rough community-average time-to-complete, so treat the ratio as a loose hint, not a precise measure.",
  "- My hours are LIFETIME totals, so the ratio is most meaningful for completion-style games (narrative / RPG / adventure) where there's an end to reach.",
  "- Do NOT overweight it for clearly live-service / multiplayer games (e.g. FIFA / EA FC, Apex, Fortnite, Destiny) — they have no 'completion', so a huge ratio there reflects an ongoing habit, not finishing-and-loving a game.",
  "- The comparison is shown only for games where a typical time exists; its absence on a game says nothing — do not infer anything from a missing comparison.",
  "- A low recorded-hour count can itself be unreliable: PSN sometimes under-reports play time, so weight hours DOWN when trophies or completion contradict them — a fully-completed game showing only ~1h is the tell that real time played is far higher, never proof of low engagement.",
].join("\n");

/**
 * Guidance telling the model NOT to read moderate/low trophy completion or a
 * "stopped playing" game as inherent dislike, and to use the signals already in
 * the prompt — playtime-vs-typical-time (#93) and genre/type (#94) — to tell
 * satisfied main-story completion apart from genuine abandonment. Calibration
 * only, with an explicit caveat against flipping the error the other way; the
 * model still weighs it against the data and reaches its own verdict.
 */
export const COMPLETION_INTERPRETATION_GUIDANCE = [
  "Do NOT treat moderate or low trophy completion, or a game I 'stopped playing', as inherent dislike or abandonment — finishing the main story and skipping grindy endgame, DLC or multiplayer trophies is satisfied completion, not a bounce-off, especially for campaign and live-service titles:",
  "- Use the playtime-vs-typical-time line ('you: Xh lifetime vs typical ~Yh (~Nx)') to tell them apart: if my lifetime hours are roughly the typical completion time and then play stopped, that MAY indicate satisfied completion, even when trophy completion looks low.",
  "- Use genre/type the same way: 'campaign + live-service endgame' titles expect low post-campaign engagement, with a large share of trophies sitting behind grind, multiplayer or DLC that an engaged story-player legitimately skips — so low completion there is expected, not dislike.",
  "Do NOT flip the error the other way: a game with few hours, well SHORT of its typical completion time, and low trophies is still a genuine abandonment/bounce-off — use genre to TELL satisfied completion apart from abandonment, never to assume every incomplete game was finished and loved.",
  "- 'trophies unknown (no data)' stays UNKNOWN, not dislike — never read a satisfied-completion or abandonment verdict off missing trophy data.",
].join("\n");

export const ADD_ON_SIGNAL_GUIDANCE = [
  "When a game's line shows 'add-ons purchased: N', read buying DLC/add-ons as a SUPPORTING commitment/intent signal — NOT an enjoyment verdict on its own, and never a value computed in code; infer enjoyment only when it is corroborated by playtime, recency or trophies.",
  "Honour these caveats:",
  "- This signal exists only when I imported transaction history; absence of add-on purchases is NOT a negative signal.",
  "- DLC, bundle and re-release names do not always line up with the base title; unmatched add-ons are ignored gracefully, not misattributed.",
  "- Do not double-count bundles or base-game-with-DLC editions as add-ons.",
].join("\n");

function addOnGuidance(data: DashboardData, transactions?: readonly TransactionRow[]): string[] {
  if (!transactions || transactions.length === 0) return [];
  return summariseAddOns(data, transactions).length === 0 ? [] : [ADD_ON_SIGNAL_GUIDANCE];
}

export const PRICE_CONTEXT_GUIDANCE = [
  "When a game's line shows 'bought: <free|deep-sale|discounted|full-price>', read the price I paid versus the original price as a SUPPORTING context signal about my intent, patience, hype and value-sensitivity — NOT an enjoyment verdict, and never a value computed in code:",
  "- Paying full price or buying early can suggest hype or low price-sensitivity; waiting for a deep sale can suggest patience or caution — weigh this only alongside hours, recency and trophies, never on its own.",
  "Honour these caveats and never overclaim:",
  "- A sale or deep-sale purchase does NOT imply lower enjoyment.",
  "- A full-price purchase does NOT imply higher enjoyment by itself.",
  "- Missing spend data is UNKNOWN, not neutral or negative — most games have no imported price, and that absence says nothing about enjoyment or intent.",
  "- Attribution depends on transaction import quality; unmatched purchases are ignored gracefully, not misattributed.",
].join("\n");

function priceContextGuidance(
  data: DashboardData,
  transactions?: readonly TransactionRow[]
): string[] {
  if (!transactions || transactions.length === 0) return [];
  return summarisePriceContext(data, transactions).length === 0 ? [] : [PRICE_CONTEXT_GUIDANCE];
}

export const SPEND_SIGNAL_GUIDANCE = [
  "When the 'Spend (imported transaction history)' block is present you can answer questions about my spend totals, spend over time, wallet top-ups and cost per hour played — but treat spend as a SUPPORTING context signal about my budgeting, patience and value-sensitivity, NEVER an enjoyment verdict, and never a value judgement baked into the figures: the numbers are factual cost, and deciding whether something was 'worth it' is your reasoning, weighed alongside hours, recency and trophies.",
  "Honour these caveats and never overclaim:",
  "- Cost per hour is just total matched spend ÷ lifetime hours — a low cost per hour means many hours per pound, NOT more enjoyment, and a high cost per hour does NOT imply regret.",
  "- Wallet top-ups fund the wallet balance and are NOT spend on any game — never attribute a top-up to a title or count it as a purchase.",
  "- Unmatched spend, and games with no matched purchase (PS Plus, pre-installs, free claims), are UNKNOWN, not zero — imported transactions cover only part of a library, so absent spend says nothing about enjoyment or intent.",
  "- These figures exist only because I imported transaction history, and DLC/bundle attribution is imperfect, so don't over-index on any single number.",
].join("\n");

function spendGuidance(transactions?: readonly TransactionRow[]): string[] {
  return transactions && transactions.length > 0 ? [SPEND_SIGNAL_GUIDANCE] : [];
}

/**
 * Global caveat placed before the per-metric guidance blocks. It reframes those
 * blocks as interpretive hints rather than a scoring rubric so no single metric
 * (hours, trophies, playtime-vs-typical-time, add-ons, price) becomes de facto
 * truth, while explicitly preserving ranking/scoring for the lead questions that
 * ask for it.
 */
export const METRIC_GUIDANCE_CAVEAT = [
  "The guidance below gives interpretive hints, NOT a scoring rubric: treat each signal (hours, recency, trophies, playtime-vs-typical-time, add-ons, price) as WEAK evidence on its own, and let no single metric dominate unless several independent signals agree.",
  "This is not a ban on ranking or scoring — when a question explicitly asks you to rank or score (e.g. top 10 by hours, rank my franchises), do exactly that, but build the ordering from converging signals rather than one metric, and don't invent a rigid points system.",
].join("\n");

/**
 * Groups whose lead question is anchored on a metric reading (enjoyment-vs-time,
 * completion, recommendations, and the ranking/efficiency questions under
 * "More"). For these the per-metric calibration rubric (trophy / playtime /
 * completion / add-on / price) earns its place. For the soft groups ("Taste &
 * preferences", "Profile & personality") that rubric is mostly noise that
 * anchors the model into a scoring mindset, so it is dropped — the global caveat
 * and the genre-interpretation block (#94) still apply. "More" defaults in:
 * a couple of its questions are soft, but over-informing is safer than starving
 * a metric question, and genre interpretation is shown regardless.
 */
const METRIC_RUBRIC_GROUPS = new Set<PromptGroup>([
  "Engagement & enjoyment",
  "Completion & habits",
  "Recommendations",
  "More",
]);

/** Sentinel selecting the no-lead "menu" mode in `buildPrompt`. */
export const MENU_MODE = "menu" as const;

/**
 * The menu-mode lead instruction: instead of a `TASK:` analysis, the model
 * introduces what it can tell from the data and presents the grouped menu,
 * analysing nothing until the user picks a question.
 */
export const MENU_INSTRUCTION =
  "Don't analyse anything yet. Briefly introduce what you can tell me from this data, then present a concise menu of what I could ask — grouped (Engagement & enjoyment, Completion & habits, Taste & preferences, Profile & personality, Recommendations, More) — and ask which I'd like to explore first.";

/**
 * The menu instruction for the current prompt: the verbatim {@link MENU_INSTRUCTION}
 * by default, with the "Spending & value" group folded into its enumerated group
 * list ONLY when transactions are imported. Gating it here keeps the
 * no-transactions menu prompt byte-identical to before spend questions existed.
 */
function menuInstruction(transactions?: readonly TransactionRow[]): string {
  if (!transactions || transactions.length === 0) return MENU_INSTRUCTION;
  return MENU_INSTRUCTION.replace(
    "Recommendations, More)",
    "Recommendations, Spending & value, More)"
  );
}

/**
 * The full grouped menu of questions, built from the {@link availableVariants}
 * (the spend questions are folded in only when transactions are imported) so it
 * stays in sync as variants change. Unlike `buildFollowUps` it excludes no lead
 * — there is no lead question in menu mode, so every available question is on offer.
 */
export function buildMenu(transactions?: readonly TransactionRow[]): string {
  const variants = availableVariants(transactions);
  const lines = ["MENU — the questions I could ask, grouped (pick one to start):"];
  for (const group of PROMPT_GROUPS) {
    const questions = variants.filter((v) => v.group === group);
    if (questions.length === 0) continue;
    lines.push(`${group}:`);
    for (const v of questions) lines.push(`- ${v.question}`);
  }
  return lines.join("\n");
}

/**
 * Build the no-lead "menu" prompt: the data summary once, then a menu
 * instruction (no `TASK:` analysis) and the grouped question menu.
 *
 * Guidance choice (interacts with #115): menu mode has no group and runs NO
 * analysis this turn, so it keeps the always-on global caveat and the genre
 * play-pattern calibration (#94), but DEFERS the per-metric calibration rubric
 * (trophy / playtime / completion / add-on / price) — front-loading that
 * calibration before the user has picked a question is noise, so it waits until
 * the user actually chooses an analysis.
 */
function buildMenuPrompt(data: DashboardData, transactions?: readonly TransactionRow[]): string {
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "Weigh WHEN I played (recency and trends from each game's last/first played dates), not just total hours — a big total played years ago means something different from a smaller total I'm playing now.",
    METRIC_GUIDANCE_CAVEAT,
    PLAY_PATTERN_GUIDANCE,
    "",
    buildDataSummary(data, transactions),
    "",
    menuInstruction(transactions),
    "",
    buildMenu(transactions),
  ].join("\n");
}

/**
 * Build the full, ready-to-paste prompt: the data summary once, the chosen
 * lead question, then the rest as paste-able follow-ups. Passing `MENU_MODE`
 * instead of a variant produces the no-lead menu prompt (see `buildMenuPrompt`).
 *
 * The global caveat and the genre-interpretation block are always shown. The
 * per-metric calibration rubric is included only when the lead question's group
 * is anchored on a metric reading (see `METRIC_RUBRIC_GROUPS`); the conditional
 * add-on / price blocks are additionally gated on imported transactions.
 */
export function buildPrompt(
  data: DashboardData,
  lead: PromptVariant | typeof MENU_MODE,
  transactions?: readonly TransactionRow[]
): string {
  if (lead === MENU_MODE) return buildMenuPrompt(data, transactions);
  const metricRubric = METRIC_RUBRIC_GROUPS.has(lead.group)
    ? [
        TROPHY_SIGNAL_GUIDANCE,
        PLAYTIME_SIGNAL_GUIDANCE,
        COMPLETION_INTERPRETATION_GUIDANCE,
        ...addOnGuidance(data, transactions),
        ...priceContextGuidance(data, transactions),
        ...spendGuidance(transactions),
      ]
    : [];
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "Weigh WHEN I played (recency and trends from each game's last/first played dates), not just total hours — a big total played years ago means something different from a smaller total I'm playing now.",
    METRIC_GUIDANCE_CAVEAT,
    PLAY_PATTERN_GUIDANCE,
    ...metricRubric,
    "",
    buildDataSummary(data, transactions),
    "",
    `TASK: ${lead.instruction}`,
    "",
    buildFollowUps(lead, transactions),
  ].join("\n");
}
