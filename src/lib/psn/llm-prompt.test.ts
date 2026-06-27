import { describe, expect, it } from "vitest";
import { fmtDate } from "@/components/dashboard/format";
import { topGamesByHours } from "./analytics";
import { buildDataSummary, buildPrompt, PROMPT_VARIANTS } from "./llm-prompt";
import { demoDashboard } from "./mock";

describe(".PROMPT_VARIANTS", () => {
  it("offers the six analysis questions with unique ids", () => {
    expect(PROMPT_VARIANTS.map((v) => v.id)).toStrictEqual([
      "most-played",
      "recently",
      "next",
      "profile",
      "hidden-gems",
      "session-style",
    ]);
  });
});

describe(".buildDataSummary", () => {
  it("embeds the headline totals from the dashboard meta", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).toContain(
      `${demoDashboard.meta.totalGames} games, ${demoDashboard.meta.totalHours}h played`
    );
  });

  it("embeds the top game by hours", () => {
    const [top] = topGamesByHours(demoDashboard, 1);

    expect(buildDataSummary(demoDashboard)).toContain(`${top?.name} — ${top?.hours}h`);
  });

  it("includes each game's last and first played dates on its line", () => {
    const [top] = demoDashboard.games.toSorted((a, b) => b.hours - a.hours);

    const line = buildDataSummary(demoDashboard)
      .split("\n")
      .find((l) => l.includes(`${top?.name} —`));

    expect(line).toContain(`last played ${fmtDate(top?.lastPlayed)}`);
    expect(line).toContain(`first played ${fmtDate(top?.firstPlayed)}`);
  });

  it("lists every game in the library, not just a top slice", () => {
    const summary = buildDataSummary(demoDashboard);

    const gameLines = summary.split("\n").filter((line) => /^ {2}\d+\. /.test(line));

    expect(gameLines).toHaveLength(demoDashboard.games.length);
  });

  it("includes every genre bucket, not just a top slice", () => {
    const summary = buildDataSummary(demoDashboard);
    const genres = [...new Set(demoDashboard.games.map((g) => g.genre))];

    const present = genres.map((genre) => summary.includes(`- ${genre}:`));

    expect(present).toStrictEqual(genres.map(() => true));
  });
});

describe(".buildPrompt", () => {
  it.each(PROMPT_VARIANTS)("embeds the $id instruction and the shared data summary", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain(variant.instruction);
    expect(prompt).toContain(buildDataSummary(demoDashboard));
  });

  it.each(PROMPT_VARIANTS)("tells the model to weigh recency over raw hours for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain("Weigh WHEN I played (recency and trends");
  });

  it("gives each variant a distinct prompt body", () => {
    const prompts = PROMPT_VARIANTS.map((v) => buildPrompt(demoDashboard, v));

    expect(new Set(prompts).size).toBe(PROMPT_VARIANTS.length);
  });
});
