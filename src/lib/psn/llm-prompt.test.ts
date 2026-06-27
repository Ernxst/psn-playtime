import { describe, expect, it } from "vitest";
import { fmtDate } from "@/components/dashboard/format";
import { topGamesByHours } from "./analytics";
import {
  buildDataSummary,
  buildFollowUps,
  buildPrompt,
  PLAY_PATTERN_GUIDANCE,
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

  it("states the hours are lifetime totals with no per-period playtime", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).toContain("every hour below is a per-game LIFETIME total");
    expect(summary).toContain("PSN reports no per-period or per-session playtime");
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

  it.each(PROMPT_VARIANTS)("includes the genre on every game's line for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    const present = demoDashboard.games.map((g) => {
      const line = prompt.split("\n").find((l) => l.includes(`${g.name} —`));
      return line?.includes(`(${g.genre}`);
    });

    expect(present).toStrictEqual(demoDashboard.games.map(() => true));
  });

  it.each(PROMPT_VARIANTS)(
    "embeds the genre-calibrated play-pattern guidance for $id",
    (variant) => {
      const prompt = buildPrompt(demoDashboard, variant);

      expect(prompt).toContain(PLAY_PATTERN_GUIDANCE);
    }
  );

  it("calibrates session patterns by genre with concrete examples", () => {
    expect(PLAY_PATTERN_GUIDANCE).toContain(
      "Interpret session-length and session-count patterns RELATIVE to each game's listed genre"
    );
    expect(PLAY_PATTERN_GUIDANCE).toContain(
      "Roguelike / soulslike / fighting / sports / arcade: short, repeated sessions ARE the core loop and signal engagement, not frustration"
    );
    expect(PLAY_PATTERN_GUIDANCE).toContain(
      "Narrative / RPG / adventure: long contiguous sessions are expected; many tiny sessions may instead indicate bounce-off"
    );
    expect(PLAY_PATTERN_GUIDANCE).toContain(
      "Live-service / multiplayer: session cadence reflects habit, not completion or enjoyment"
    );
  });
});
