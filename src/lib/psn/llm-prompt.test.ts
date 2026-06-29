import { describe, expect, it } from "vitest";
import { fmtDate } from "@/components/dashboard/format";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { topGamesByHours } from "./analytics";
import {
  ADD_ON_SIGNAL_GUIDANCE,
  buildDataSummary,
  buildFollowUps,
  buildMenu,
  buildPrompt,
  COMPLETION_INTERPRETATION_GUIDANCE,
  MENU_INSTRUCTION,
  MENU_MODE,
  METRIC_GUIDANCE_CAVEAT,
  PLAY_PATTERN_GUIDANCE,
  PLAYTIME_SIGNAL_GUIDANCE,
  PRICE_CONTEXT_GUIDANCE,
  PROMPT_GROUPS,
  PROMPT_VARIANTS,
  SPEND_SIGNAL_GUIDANCE,
  SPEND_VARIANTS,
  TROPHY_SIGNAL_GUIDANCE,
} from "./llm-prompt";
import { summariseSpend } from "./spend";

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

/** Soft groups whose lead drops the metric rubric (keeping caveat + genre). */
const SOFT_LEADS = PROMPT_VARIANTS.filter(
  (v) => v.group === "Taste & preferences" || v.group === "Profile & personality"
);
/** Groups whose lead keeps the full metric calibration rubric. */
const METRIC_RUBRIC_LEADS = PROMPT_VARIANTS.filter(
  (v) => v.group !== "Taste & preferences" && v.group !== "Profile & personality"
);

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

describe(".SPEND_VARIANTS", () => {
  it("gives every spend question an id unique across all variants", () => {
    const ids = [...PROMPT_VARIANTS, ...SPEND_VARIANTS].map((v) => v.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("files every spend question under the Spending & value group", () => {
    const groups = SPEND_VARIANTS.map((v) => v.group);

    expect(groups).toStrictEqual(SPEND_VARIANTS.map(() => "Spending & value"));
  });

  it("declares the Spending & value group in PROMPT_GROUPS", () => {
    expect(PROMPT_GROUPS).toContain("Spending & value");
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

  it("states the hours are PSN-recorded and can under-report with no per-period playtime", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).toContain("every hour below is what PSN has RECORDED");
    expect(summary).toContain("PSN can under-report or miss play time");
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

  it("surfaces per-game purchase-price context when spend matches the base game", () => {
    const [game] = demoDashboard.games;
    const summary = buildDataSummary(demoDashboard, [
      tx({
        productName: game?.name ?? "",
        skuId: game?.titleId,
        amountMinor: 374,
        originalPriceMinor: 4499,
        discountMinor: 4125,
      }),
    ]);

    expect(summary).toContain("bought: deep-sale (£3.74 of £44.99)");
  });

  it("omits purchase-price context when no transactions are imported", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).not.toContain("bought:");
  });

  it("surfaces account-wide spend totals and wallet top-ups from imported transactions", () => {
    const [game] = demoDashboard.games;

    const summary = buildDataSummary(demoDashboard, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
      tx({
        kind: "top-up",
        transactionType: "WALLET_TOPUP",
        productName: "Wallet",
        amountMinor: 1000,
      }),
    ]);

    expect(summary).toContain(
      "Spend (imported transaction history): £44.99 total across 1 purchases"
    );
    expect(summary).toContain("wallet top-ups £10.00");
    expect(summary).toContain("1 games matched to a purchase");
  });

  it("breaks imported spend down by year", () => {
    const [game] = demoDashboard.games;

    const summary = buildDataSummary(demoDashboard, [
      tx({
        productName: game?.name ?? "",
        skuId: game?.titleId,
        amountMinor: 4499,
        date: "2023-05-01",
      }),
    ]);

    expect(summary).toContain("Spend by year: 2023 £44.99 (1 purchases)");
  });

  it("lists matched games by cost per hour played, lowest first", () => {
    const [game] = demoDashboard.games;
    const transactions = [
      tx({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ];
    const [leader] = summariseSpend(demoDashboard, transactions).leaderboard;

    const summary = buildDataSummary(demoDashboard, transactions);

    expect(summary).toContain(
      "Cost per hour played (matched purchases, lowest first — total matched spend ÷ lifetime hours):"
    );
    expect(summary).toContain(
      `${leader?.name}: £${leader?.spend.toFixed(2)} over ${Math.round(leader?.hours ?? 0)}h (£${leader?.perHour.toFixed(2)}/h)`
    );
  });

  it("omits the spend block when no transactions are imported", () => {
    const summary = buildDataSummary(demoDashboard);

    expect(summary).not.toContain("Spend (imported transaction history)");
    expect(summary).not.toContain("Cost per hour played");
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

  it("omits the spend questions when no transactions are imported", () => {
    const [lead] = PROMPT_VARIANTS;

    const followUps = buildFollowUps(lead);

    const present = SPEND_VARIANTS.map((v) => followUps.includes(`- ${v.question}`));

    expect(present).toStrictEqual(SPEND_VARIANTS.map(() => false));
  });

  it("lists the spend questions as follow-ups when transactions are imported", () => {
    const [lead] = PROMPT_VARIANTS;
    const [game] = demoDashboard.games;

    const followUps = buildFollowUps(lead, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    const present = SPEND_VARIANTS.map((v) => followUps.includes(`- ${v.question}`));

    expect(present).toStrictEqual(SPEND_VARIANTS.map(() => true));
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

  it.each(PROMPT_VARIANTS)("embeds the global metric caveat for $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).toContain(METRIC_GUIDANCE_CAVEAT);
  });

  it("frames the metric guidance as interpretive hints, not a scoring rubric", () => {
    expect(METRIC_GUIDANCE_CAVEAT).toContain("interpretive hints, NOT a scoring rubric");
    expect(METRIC_GUIDANCE_CAVEAT).toContain("WEAK evidence on its own");
    expect(METRIC_GUIDANCE_CAVEAT).toContain(
      "let no single metric dominate unless several independent signals agree"
    );
  });

  it("keeps ranking valid when a question explicitly asks for it", () => {
    expect(METRIC_GUIDANCE_CAVEAT).toContain("This is not a ban on ranking or scoring");
    expect(METRIC_GUIDANCE_CAVEAT).toContain("do exactly that");
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

  it.each(METRIC_RUBRIC_LEADS)(
    "embeds the baseline-weighted trophy guidance for $id",
    (variant) => {
      const prompt = buildPrompt(demoDashboard, variant);

      expect(prompt).toContain(TROPHY_SIGNAL_GUIDANCE);
    }
  );

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

  it.each(METRIC_RUBRIC_LEADS)(
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

  it.each(METRIC_RUBRIC_LEADS)(
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

  it("softens the completion-from-typical-playtime inference", () => {
    expect(COMPLETION_INTERPRETATION_GUIDANCE).toContain("that MAY indicate satisfied completion");
    expect(COMPLETION_INTERPRETATION_GUIDANCE).not.toContain(
      "I most likely finished what I came for"
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

  it("reads add-ons as a supporting signal corroborated by other signals, not a strong verdict", () => {
    expect(ADD_ON_SIGNAL_GUIDANCE).toContain("SUPPORTING commitment/intent signal");
    expect(ADD_ON_SIGNAL_GUIDANCE).toContain(
      "infer enjoyment only when it is corroborated by playtime, recency or trophies"
    );
    expect(ADD_ON_SIGNAL_GUIDANCE).not.toContain("STRONG commitment/enjoyment signal");
  });

  it("omits add-on guidance when no transactions are imported", () => {
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).not.toContain(ADD_ON_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain("add-ons purchased");
  });

  it("embeds price-context guidance when imported transactions match a base game", () => {
    const [game] = demoDashboard.games;
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(demoDashboard, variant, [
      tx({
        productName: game?.name ?? "",
        skuId: game?.titleId,
        amountMinor: 374,
        originalPriceMinor: 4499,
        discountMinor: 4125,
      }),
    ]);

    expect(prompt).toContain(PRICE_CONTEXT_GUIDANCE);
    expect(prompt).toContain("bought: deep-sale (£3.74 of £44.99)");
  });

  it("omits price-context guidance when no transactions are imported", () => {
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).not.toContain(PRICE_CONTEXT_GUIDANCE);
    expect(prompt).not.toContain("bought:");
  });

  it("keeps the sale-is-not-lower-enjoyment and missing-data-unknown caveats", () => {
    expect(PRICE_CONTEXT_GUIDANCE).toContain(
      "A sale or deep-sale purchase does NOT imply lower enjoyment."
    );
    expect(PRICE_CONTEXT_GUIDANCE).toContain(
      "Missing spend data is UNKNOWN, not neutral or negative"
    );
  });

  it("embeds spend guidance for a metric lead when transactions are imported", () => {
    const [game] = demoDashboard.games;
    const [variant] = PROMPT_VARIANTS;

    const prompt = buildPrompt(demoDashboard, variant, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ]);

    expect(prompt).toContain(SPEND_SIGNAL_GUIDANCE);
  });

  it("omits spend guidance when no transactions are imported", () => {
    const [variant] = PROMPT_VARIANTS;

    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).not.toContain(SPEND_SIGNAL_GUIDANCE);
  });

  it("reads spend as a supporting signal, never an enjoyment verdict or a coded value judgement", () => {
    expect(SPEND_SIGNAL_GUIDANCE).toContain("SUPPORTING context signal");
    expect(SPEND_SIGNAL_GUIDANCE).toContain("NEVER an enjoyment verdict");
    expect(SPEND_SIGNAL_GUIDANCE).toContain("never a value judgement baked into the figures");
  });

  it("keeps the top-up, cost-per-hour and unknown-spend caveats", () => {
    expect(SPEND_SIGNAL_GUIDANCE).toContain(
      "a low cost per hour means many hours per pound, NOT more enjoyment"
    );
    expect(SPEND_SIGNAL_GUIDANCE).toContain(
      "Wallet top-ups fund the wallet balance and are NOT spend on any game"
    );
    expect(SPEND_SIGNAL_GUIDANCE).toContain("are UNKNOWN, not zero");
  });

  it.each(SOFT_LEADS)("drops the metric rubric blocks for the soft lead $id", (variant) => {
    const prompt = buildPrompt(demoDashboard, variant);

    expect(prompt).not.toContain(TROPHY_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(PLAYTIME_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(COMPLETION_INTERPRETATION_GUIDANCE);
  });

  it.each(SOFT_LEADS)(
    "keeps the global caveat and genre play-pattern for the soft lead $id",
    (variant) => {
      const prompt = buildPrompt(demoDashboard, variant);

      expect(prompt).toContain(METRIC_GUIDANCE_CAVEAT);
      expect(prompt).toContain(PLAY_PATTERN_GUIDANCE);
    }
  );

  it.each(SOFT_LEADS)(
    "gates add-on and price guidance off for the soft lead $id even with matching transactions",
    (variant) => {
      const [game] = demoDashboard.games;

      const prompt = buildPrompt(demoDashboard, variant, [
        tx({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
        tx({
          productName: game?.name ?? "",
          skuId: game?.titleId,
          amountMinor: 374,
          originalPriceMinor: 4499,
          discountMinor: 4125,
        }),
      ]);

      expect(prompt).not.toContain(ADD_ON_SIGNAL_GUIDANCE);
      expect(prompt).not.toContain(PRICE_CONTEXT_GUIDANCE);
      expect(prompt).not.toContain(SPEND_SIGNAL_GUIDANCE);
      expect(prompt).toContain("add-ons purchased: 1");
      expect(prompt).toContain("bought: deep-sale (£3.74 of £44.99)");
    }
  );

  it.each(METRIC_RUBRIC_LEADS)(
    "leaves the no-transactions prompt byte-identical for the metric lead $id",
    (variant) => {
      expect(buildPrompt(demoDashboard, variant, [])).toBe(buildPrompt(demoDashboard, variant));
    }
  );

  it.each(PROMPT_VARIANTS)(
    "leaves the lead-question prompt unchanged when menu mode is added for $id",
    (variant) => {
      expect(buildPrompt(demoDashboard, variant)).toContain(`TASK: ${variant.instruction}`);
      expect(buildPrompt(demoDashboard, MENU_MODE)).not.toBe(buildPrompt(demoDashboard, variant));
    }
  );
});

describe(".buildMenu", () => {
  it("lists every question grouped under its category", () => {
    const menu = buildMenu();

    const populatedGroups = PROMPT_GROUPS.filter((group) =>
      PROMPT_VARIANTS.some((v) => v.group === group)
    );
    const present = populatedGroups.flatMap((group) => [
      menu.includes(`${group}:`),
      ...PROMPT_VARIANTS.filter((v) => v.group === group).map((v) =>
        menu.includes(`- ${v.question}`)
      ),
    ]);

    expect(present).toStrictEqual(present.map(() => true));
  });

  it("omits the spend group and its questions when no transactions are imported", () => {
    const menu = buildMenu();

    const present = SPEND_VARIANTS.map((v) => menu.includes(`- ${v.question}`));

    expect(menu).not.toContain("Spending & value:");
    expect(present).toStrictEqual(SPEND_VARIANTS.map(() => false));
  });

  it("folds in the spend group and its questions when transactions are imported", () => {
    const [game] = demoDashboard.games;

    const menu = buildMenu([tx({ productName: game?.name ?? "", skuId: game?.titleId })]);

    const present = SPEND_VARIANTS.map((v) => menu.includes(`- ${v.question}`));

    expect(menu).toContain("Spending & value:");
    expect(present).toStrictEqual(SPEND_VARIANTS.map(() => true));
  });
});

describe(".buildPrompt (menu mode)", () => {
  it("replaces the TASK analysis lead with the menu instruction", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).not.toContain("TASK:");
    expect(prompt).toContain(MENU_INSTRUCTION);
  });

  it("does not embed any lead question's analysis instruction", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    const embedded = PROMPT_VARIANTS.map((v) => prompt.includes(v.instruction));

    expect(embedded).toStrictEqual(PROMPT_VARIANTS.map(() => false));
  });

  it("presents the full grouped question menu", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).toContain(buildMenu());
  });

  it("still embeds the data summary exactly once", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).toContain(buildDataSummary(demoDashboard));
    expect(prompt.split("DATA (my PlayStation playtime, lifetime totals):")).toHaveLength(2);
  });

  it("keeps the always-on global caveat and genre play-pattern guidance", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).toContain(METRIC_GUIDANCE_CAVEAT);
    expect(prompt).toContain(PLAY_PATTERN_GUIDANCE);
  });

  it("defers the per-metric calibration rubric until a question is picked", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).not.toContain(TROPHY_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(PLAYTIME_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(COMPLETION_INTERPRETATION_GUIDANCE);
  });

  it("defers the add-on and price rubric even when transactions match", () => {
    const [game] = demoDashboard.games;

    const prompt = buildPrompt(demoDashboard, MENU_MODE, [
      tx({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
      tx({
        productName: game?.name ?? "",
        skuId: game?.titleId,
        amountMinor: 374,
        originalPriceMinor: 4499,
        discountMinor: 4125,
      }),
    ]);

    expect(prompt).not.toContain(ADD_ON_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(PRICE_CONTEXT_GUIDANCE);
    expect(prompt).not.toContain(SPEND_SIGNAL_GUIDANCE);
    expect(prompt).toContain("add-ons purchased: 1");
    expect(prompt).toContain("bought: deep-sale (£3.74 of £44.99)");
  });

  it("still surfaces the spend data block while deferring the spend guidance", () => {
    const [game] = demoDashboard.games;

    const prompt = buildPrompt(demoDashboard, MENU_MODE, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ]);

    expect(prompt).toContain("Spend (imported transaction history):");
    expect(prompt).not.toContain(SPEND_SIGNAL_GUIDANCE);
  });

  it("folds the spend questions into the menu when transactions are imported", () => {
    const [game] = demoDashboard.games;

    const prompt = buildPrompt(demoDashboard, MENU_MODE, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    const present = SPEND_VARIANTS.map((v) => prompt.includes(`- ${v.question}`));

    expect(prompt).toContain("Spending & value:");
    expect(present).toStrictEqual(SPEND_VARIANTS.map(() => true));
  });

  it("leaves the no-transactions menu prompt byte-identical to the undefined case", () => {
    expect(buildPrompt(demoDashboard, MENU_MODE, [])).toBe(buildPrompt(demoDashboard, MENU_MODE));
  });

  it("keeps the menu instruction's enumerated group list spend-free without transactions", () => {
    const prompt = buildPrompt(demoDashboard, MENU_MODE);

    expect(prompt).toContain(MENU_INSTRUCTION);
    expect(prompt).not.toContain("Recommendations, Spending & value, More)");
  });

  it("adds the spend group to the menu instruction's enumerated list with transactions", () => {
    const [game] = demoDashboard.games;

    const prompt = buildPrompt(demoDashboard, MENU_MODE, [
      tx({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    expect(prompt).toContain("Recommendations, Spending & value, More)");
  });
});
