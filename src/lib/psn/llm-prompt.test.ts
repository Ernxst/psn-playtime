import { describe, expect, it } from "vitest";
import { fmtDate } from "@/components/dashboard/format";
import { topGamesByHours } from "./analytics";
import {
  ADD_ON_SIGNAL_GUIDANCE,
  buildDataSummary,
  buildFollowUps,
  buildPrompt,
  COMPLETION_INTERPRETATION_GUIDANCE,
  PLAY_PATTERN_GUIDANCE,
  PLAYTIME_SIGNAL_GUIDANCE,
  PROMPT_GROUPS,
  PROMPT_VARIANTS,
  TROPHY_SIGNAL_GUIDANCE,
} from "./llm-prompt";
import { demoDashboard } from "./mock";
import type { TransactionRow } from "./transactions";
import type { GamePlay } from "./types";

function tx(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    transactionId: "t",
    key: "k",
    date: "2023-01-01",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "",
    quantity: 1,
    amountMinor: 0,
    currency: "£",
    displayAmount: "",
    ...overrides,
  };
}

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

  it("reports earned trophy counts and platinum status for every game with trophy data", () => {
    const summary = buildDataSummary(demoDashboard);
    const withTrophy = demoDashboard.games.filter(
      (g): g is GamePlay & { trophy: NonNullable<GamePlay["trophy"]> } => Boolean(g.trophy)
    );

    const present = withTrophy.map((g) => {
      const t = g.trophy;
      const status = !t.hasPlatinum
        ? "no platinum available"
        : t.earned.platinum >= 1
          ? "platinum earned"
          : "platinum available, not earned";
      return summary.includes(
        `trophies ${t.progress}% complete (earned P${t.earned.platinum}/G${t.earned.gold}/S${t.earned.silver}/B${t.earned.bronze}), ${status}`
      );
    });

    expect(present).toStrictEqual(withTrophy.map(() => true));
  });

  it("surfaces missing trophy data as unknown rather than zero", () => {
    const games = demoDashboard.games.map((g) => ({ ...g, trophy: undefined }));

    const summary = buildDataSummary({ ...demoDashboard, games });

    expect(summary).toContain("trophies unknown (no data)");
  });

  it("compares lifetime hours against the typical playtime when RAWG has one", () => {
    const [top] = demoDashboard.games.toSorted((a, b) => b.hours - a.hours);
    const games = demoDashboard.games.map((g) =>
      g.titleId === top?.titleId ? { ...g, typicalPlaytime: 25 } : g
    );

    const line = buildDataSummary({ ...demoDashboard, games })
      .split("\n")
      .find((l) => l.includes(`${top?.name} —`));

    const ratio = ((top?.hours ?? 0) / 25).toFixed(1);
    expect(line).toContain(
      `you: ${Math.round(top?.hours ?? 0)}h lifetime vs typical ~25h (~${ratio}x)`
    );
  });

  it("omits the playtime comparison for games without a typical playtime", () => {
    const games = demoDashboard.games.map((g) => ({ ...g, typicalPlaytime: undefined }));

    const summary = buildDataSummary({ ...demoDashboard, games });

    expect(summary).not.toContain("vs typical ~");
  });

  it("includes the completionist baseline with the account platinums and platinum rate", () => {
    const eligible = demoDashboard.games.filter((g) => g.trophy?.hasPlatinum === true);
    const platinumed = eligible.filter((g) => (g.trophy?.earned.platinum ?? 0) >= 1);
    const rate = Math.round((platinumed.length / eligible.length) * 100);

    const summary = buildDataSummary(demoDashboard);

    expect(summary).toContain(
      `Completionist baseline: ${demoDashboard.profile.earned.platinum} platinums earned account-wide; platinumed ${platinumed.length} of ${eligible.length} platinum-eligible games with trophy data (${rate}% platinum rate)`
    );
  });

  it("degrades the platinum rate gracefully when no game has a platinum available", () => {
    const games = demoDashboard.games.map((g) => ({ ...g, trophy: undefined }));

    const summary = buildDataSummary({ ...demoDashboard, games });

    expect(summary).toContain(
      "platinumed 0 of 0 platinum-eligible games with trophy data (no platinum-eligible games with trophy data, so no rate)"
    );
  });

  it("includes matched per-game add-on counts from imported transactions", () => {
    const [game] = demoDashboard.games;
    const summary = buildDataSummary(demoDashboard, [
      tx({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
    ]);

    expect(summary).toContain(`${game?.name} —`);
    expect(summary).toContain("add-ons purchased: 1");
  });

  it("omits add-on transaction lines when no transactions are imported", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).not.toContain("add-ons purchased");
    expect(summary).not.toContain("Imported transaction signal");
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

  it.each(PROMPT_VARIANTS)("embeds the baseline-weighted trophy guidance for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain(TROPHY_SIGNAL_GUIDANCE);
  });

  it("weights a platinum relative to the completionist baseline", () => {
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "weight each one RELATIVE to my completionist baseline above"
    );
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "A platinum from a low-baseline player (someone who rarely platinums) is a STRONG signal"
    );
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "For a habitual platinum-hunter (high baseline) a platinum is expected and discriminates far less"
    );
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "High trophy counts or completion % short of a platinum are a SOFTER version of the same signal"
    );
  });

  it("keeps the missing-data and no-platinum-available caveats", () => {
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "'trophies unknown (no data)' means UNKNOWN, NOT zero"
    );
    expect(TROPHY_SIGNAL_GUIDANCE).toContain(
      "'no platinum available' (common for multiplayer/older titles) is NOT a negative signal"
    );
    expect(TROPHY_SIGNAL_GUIDANCE).toContain("I have no trophy-difficulty data");
  });

  it.each(PROMPT_VARIANTS)(
    "embeds the lifetime-vs-typical playtime guidance for $id",
    (variant) => {
      const prompt = buildPrompt(demoDashboard, variant);

      expect(prompt).toContain(PLAYTIME_SIGNAL_GUIDANCE);
    }
  );

  it("frames the playtime ratio as a soft signal, not for live-service games", () => {
    expect(PLAYTIME_SIGNAL_GUIDANCE).toContain(
      "read a ratio well above 1 (much longer than typical) as a SOFT enjoyment/engagement signal"
    );
    expect(PLAYTIME_SIGNAL_GUIDANCE).toContain("never as a primary metric");
    expect(PLAYTIME_SIGNAL_GUIDANCE).toContain(
      "Do NOT overweight it for clearly live-service / multiplayer games"
    );
  });

  it.each(PROMPT_VARIANTS)(
    "embeds the satisfied-completion vs abandonment guidance for $id",
    (variant) => {
      const prompt = buildPrompt(demoDashboard, variant);

      expect(prompt).toContain(COMPLETION_INTERPRETATION_GUIDANCE);
    }
  );

  it("tells the model not to read low completion or stopping as inherent dislike", () => {
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "Do NOT treat moderate or low trophy completion, or a game I 'stopped playing', as inherent dislike or abandonment"
    );
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "finishing the main story and skipping grindy endgame, DLC or multiplayer trophies is satisfied completion"
    );
  });

  it("uses playtime-vs-typical-time and genre to tell satisfied completion apart from abandonment", () => {
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "Use the playtime-vs-typical-time line ('you: Xh lifetime vs typical ~Yh (~Nx)') to tell them apart"
    );
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "Use genre/type the same way: 'campaign + live-service endgame' titles expect low post-campaign engagement"
    );
  });

  it("keeps the caveat against flipping the error and the missing-data caveat", () => {
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "Do NOT flip the error the other way: a game with few hours, well SHORT of its typical completion time, and low trophies is still a genuine abandonment/bounce-off"
    );
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain(
      "'trophies unknown (no data)' stays UNKNOWN, not dislike"
    );
  });

  it("embeds add-on guidance when imported transactions match add-ons", () => {
    const [game] = demoDashboard.games;
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(demoDashboard, variant, [
      tx({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
    ]);

    expect(prompt).toContain(ADD_ON_SIGNAL_GUIDANCE);
    expect(prompt).toContain("add-ons purchased: 1");
  });

  it("omits add-on guidance when no transactions are imported", () => {
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).not.toContain(ADD_ON_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain("add-ons purchased");
  });
});
