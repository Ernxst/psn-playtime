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
import type { DashboardData, GamePlay } from "./types";

/** The category a question belongs to, used to group the selector and follow-ups. */
export type PromptGroup =
  | "Engagement & enjoyment"
  | "Completion & habits"
  | "Taste & preferences"
  | "Recommendations"
  | "Profile & personality"
  | "More";

/** Display order for the groups in both the selector and the follow-up menu. */
export const PROMPT_GROUPS = [
  "Engagement & enjoyment",
  "Completion & habits",
  "Taste & preferences",
  "Recommendations",
  "Profile & personality",
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

/** Compact "last/first played" timing, omitting dates that are unknown. */
function gameTiming(g: GamePlay): string {
  const parts: string[] = [];
  if (g.lastPlayed) parts.push(`last played ${fmtDate(g.lastPlayed)}`);
  if (g.firstPlayed) parts.push(`first played ${fmtDate(g.firstPlayed)}`);
  return parts.length === 0 ? ", timing unknown" : `, ${parts.join(", ")}`;
}

/**
 * Every game, biggest first, with its hours, genre, franchise and when it was
 * last (and first) played so recency can be weighed against raw hours.
 */
function listGames(data: DashboardData): string {
  return data.games
    .toSorted((a, b) => b.hours - a.hours)
    .map((g, i) => {
      const franchise = g.franchise ? `, ${g.franchise}` : "";
      return `  ${i + 1}. ${g.name} — ${Math.round(g.hours)}h (${g.genre}${franchise})${gameTiming(g)}`;
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

/** The compact, structured data summary embedded once in every prompt. */
export function buildDataSummary(data: DashboardData): string {
  const totals = headlineTotals(data);
  const value = valuePerGame(data);
  const r = recency(data);

  return [
    "DATA (my PlayStation playtime, lifetime totals):",
    "- Note: every hour below is a per-game LIFETIME total from PSN. PSN reports no per-period or per-session playtime, so never read these as hours played within a specific window.",
    `- Totals: ${totals.gamesPlayed} games, ${totals.totalHours}h played, ${totals.sessions} sessions, PSN trophy level ${totals.trophyLevel}.`,
    `- Averages: ${value.avgHoursPerGame}h per game, ${value.avgSessionsPerGame} sessions per game, ${value.avgSessionLength}h per session.`,
    `- Recency (${r.thisYear}): ${r.activeGames} active games (${r.activeHours}h) vs ${r.dormantGames} dormant (${r.dormantHours}h).`,
    "- All games by hours (with when each was last/first played):",
    listGames(data),
    "- Genres by hours:",
    listGenres(data),
    "- Franchises by hours:",
    listFranchises(data),
    "- Session style (hours per session):",
    listSessionStyle(data),
  ].join("\n");
}

/**
 * The curated follow-up menu: every question EXCEPT the lead, grouped by
 * category, phrased so the user can paste any of them straight into the ongoing
 * chat without re-sending the data.
 */
export function buildFollowUps(lead: PromptVariant): string {
  const lines = [
    "FOLLOW-UP QUESTIONS — paste any of these into this chat afterwards; you already have my data above, so don't ask me to resend it:",
  ];
  for (const group of PROMPT_GROUPS) {
    const questions = PROMPT_VARIANTS.filter((v) => v.group === group && v.id !== lead.id);
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
 * Build the full, ready-to-paste prompt: the data summary once, the chosen
 * lead question, then the rest as paste-able follow-ups.
 */
export function buildPrompt(data: DashboardData, lead: PromptVariant): string {
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "Weigh WHEN I played (recency and trends from each game's last/first played dates), not just total hours — a big total played years ago means something different from a smaller total I'm playing now.",
    PLAY_PATTERN_GUIDANCE,
    "",
    buildDataSummary(data),
    "",
    `TASK: ${lead.instruction}`,
    "",
    buildFollowUps(lead),
  ].join("\n");
}
