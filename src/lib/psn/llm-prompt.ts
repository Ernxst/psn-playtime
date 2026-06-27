/**
 * Build ready-to-paste LLM prompts from a `DashboardData`.
 *
 * Each prompt embeds the SAME compact, structured summary of the player's
 * library (totals, top games, genres, franchises, recency, session style) and
 * pairs it with a different analysis instruction so the user can ask an LLM a
 * specific question about their playtime.
 *
 * The summary is derived entirely from the existing `analytics.ts` selectors —
 * nothing here recomputes or duplicates that logic.
 */
import {
  bingeVsDipIn,
  genreBreakdown,
  headlineTotals,
  recency,
  topFranchises,
  topGamesByHours,
  valuePerGame,
} from "./analytics";
import type { DashboardData } from "./types";

/** A selectable question the user can copy a prompt for. */
export interface PromptVariant {
  id: string;
  /** Short label for the selector control. */
  label: string;
  /** One-line description of what the LLM is asked to do. */
  description: string;
  /** The analysis instruction embedded after the data summary. */
  instruction: string;
}

/**
 * The questions on offer. Each shares the data summary but asks the LLM
 * something different. Ordered most-to-least common intent.
 */
export const PROMPT_VARIANTS = [
  {
    id: "most-played",
    label: "What do I play the most?",
    description: "Top games, genres and franchises by hours.",
    instruction:
      "Tell me what I play the most. Rank my biggest games, genres and franchises by hours, and describe the clear patterns in where my time goes.",
  },
  {
    id: "recently",
    label: "What am I into recently?",
    description: "Recency and how my taste is trending.",
    instruction:
      "Tell me what I'm into recently. Compare my still-active games against the dormant ones, and describe how my tastes seem to be trending lately versus my all-time habits.",
  },
  {
    id: "next",
    label: "What should I play next?",
    description: "Recommendations from my taste and backlog signals.",
    instruction:
      "Recommend what I should play next. Base it on my favourite genres and franchises, the kinds of games I sink the most hours into, and which series I seem to have drifted away from. Suggest specific titles and say why each fits.",
  },
  {
    id: "profile",
    label: "What kind of gamer am I?",
    description: "Overall profile: trends, value-for-money, binge vs dip-in.",
    instruction:
      "Describe what kind of gamer I am. Cover my overall trends, how much value I get out of each game, and whether I'm more of a binge player (long sessions) or a dip-in player (many short launches). Give me a short, vivid player profile.",
  },
  {
    id: "hidden-gems",
    label: "Hidden gems I under-played",
    description: "Good-fit games I barely touched.",
    instruction:
      "Find the hidden gems I under-played. Point out games I barely put hours into that look like a strong match for my favourite genres and franchises, and suggest which ones are worth returning to.",
  },
  {
    id: "session-style",
    label: "Am I a binger or a dipper?",
    description: "Session length: marathons vs quick launches.",
    instruction:
      "Tell me whether I'm a binge player or a dip-in player. Use my hours-per-session figures to separate the games I marathon from the ones I only dip into, and describe my overall session style.",
  },
] as const satisfies readonly PromptVariant[];

function listGames(data: DashboardData): string {
  return topGamesByHours(data, 10)
    .map((g, i) => `  ${i + 1}. ${g.name} — ${g.hours}h (${g.platform})`)
    .join("\n");
}

function listGenres(data: DashboardData): string {
  return genreBreakdown(data)
    .slice(0, 8)
    .map((g) => `  - ${g.genre}: ${g.hours}h across ${g.games} games (${g.share}%)`)
    .join("\n");
}

function listFranchises(data: DashboardData): string {
  const franchises = topFranchises(data, 8);
  if (franchises.length === 0) return "  (none detected)";
  return franchises
    .map((f) => `  - ${f.franchise}: ${f.hours}h across ${f.games} games`)
    .join("\n");
}

function listSessionStyle(data: DashboardData): string {
  return bingeVsDipIn(data, 8)
    .map((s) => `  - ${s.name}: ${s.hoursPerSession}h/session over ${s.playCount} sessions`)
    .join("\n");
}

/** The compact, structured data summary shared by every prompt. */
export function buildDataSummary(data: DashboardData): string {
  const totals = headlineTotals(data);
  const value = valuePerGame(data);
  const r = recency(data);

  return [
    "DATA (my PlayStation playtime, lifetime totals):",
    `- Totals: ${totals.gamesPlayed} games, ${totals.totalHours}h played, ${totals.sessions} sessions, PSN trophy level ${totals.trophyLevel}.`,
    `- Averages: ${value.avgHoursPerGame}h per game, ${value.avgSessionsPerGame} sessions per game, ${value.avgSessionLength}h per session.`,
    `- Recency (${r.thisYear}): ${r.activeGames} active games (${r.activeHours}h) vs ${r.dormantGames} dormant (${r.dormantHours}h).`,
    "- Top games by hours:",
    listGames(data),
    "- Genres by hours:",
    listGenres(data),
    "- Franchises by hours:",
    listFranchises(data),
    "- Session style (hours per session):",
    listSessionStyle(data),
  ].join("\n");
}

/** Build the full, ready-to-paste prompt for a variant from the dashboard data. */
export function buildPrompt(data: DashboardData, variant: PromptVariant): string {
  return [
    "You are a gaming analyst. I'm sharing a summary of my PlayStation playtime.",
    "",
    buildDataSummary(data),
    "",
    `TASK: ${variant.instruction}`,
  ].join("\n");
}
