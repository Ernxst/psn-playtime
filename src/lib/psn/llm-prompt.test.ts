import { describe, expect, it } from "vitest";
import { fmtDate } from "@/components/dashboard/format";
import { topGamesByHours } from "./analytics";
import {
  buildDataSummary,
  buildFollowUps,
  buildPrompt,
  PROMPT_GROUPS,
  PROMPT_VARIANTS,
} from "./llm-prompt";
import { demoDashboard } from "./mock";

describe(".PROMPT_VARIANTS", () => {
  it("gives every question a unique id", () => {
    const ids = PROMPT_VARIANTS.map((v) => v.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses groups declared in PROMPT_GROUPS", () => {
    const groups = [...new Set(PROMPT_VARIANTS.map((v) => v.group))];

    const known = groups.map((group) => PROMPT_GROUPS.includes(group));

    expect(known).toStrictEqual(groups.map(() => true));
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

describe(".buildFollowUps", () => {
  it.each(PROMPT_VARIANTS)("lists every other question as a follow-up for $id", (lead) => {
    const followUps = buildFollowUps(lead);

    const others = PROMPT_VARIANTS.filter((v) => v.id !== lead.id);
    const listed = others.map((v) => followUps.includes(`- ${v.question}`));

    expect(listed).toStrictEqual(others.map(() => true));
  });

  it.each(PROMPT_VARIANTS)("omits the lead question from its own follow-ups for $id", (lead) => {
    const followUps = buildFollowUps(lead);

    expect(followUps).not.toContain(`- ${lead.question}`);
  });

  it("instructs the model not to ask for the data again", () => {
    const [lead] = PROMPT_VARIANTS;

    expect(buildFollowUps(lead)).toContain("don't ask me to resend it");
  });
});

describe(".buildPrompt", () => {
  it.each(PROMPT_VARIANTS)("leads with the $id instruction over the shared data", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain(`TASK: ${variant.instruction}`);
    expect(prompt).toContain(buildDataSummary(demoDashboard));
  });

  it.each(PROMPT_VARIANTS)("embeds the data summary exactly once for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt.split("DATA (my PlayStation playtime, lifetime totals):")).toHaveLength(2);
  });

  it.each(PROMPT_VARIANTS)("appends the follow-up menu for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain(buildFollowUps(variant));
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
