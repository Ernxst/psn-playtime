import { describe, expect, it } from "vitest";
import { topGamesByHours } from "@/features/dashboard/filters/analytics";
import { fmtDate } from "@/features/dashboard/format";
import { summariseSpend } from "@/features/dashboard/spend/spend";
import type { GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { buildDataSummary, buildFollowUps, buildMenu, buildPrompt } from "./llm-prompt";
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
} from "./llm-prompt-catalogue";

/** Soft groups whose lead drops the metric rubric (keeping caveat + genre). */
const SOFT_LEADS = PROMPT_VARIANTS.filter((v) => !METRIC_RUBRIC_GROUPS.has(v.group));
/** Groups whose lead keeps the full metric calibration rubric. */
const METRIC_RUBRIC_LEADS = PROMPT_VARIANTS.filter((v) => METRIC_RUBRIC_GROUPS.has(v.group));

const SPEND_QUESTIONS = [
  { id: "spend-over-time", question: "How has my spending on games changed over time?" },
  {
    id: "cost-per-hour",
    question: "Which games were the most and least expensive per hour I played?",
  },
  {
    id: "full-price-vs-sale",
    question: "Which games did I buy at full price versus on a deep sale?",
  },
  { id: "add-on-spend", question: "Where did my DLC and add-on spending go?" },
  { id: "wallet-top-ups", question: "How much did I top up my wallet versus spend on games?" },
  { id: "spend-on-barely-played", question: "What did I spend on games I barely played?" },
  { id: "free-vs-paid-played", question: "Which of my PS Plus or free games did I actually play?" },
  { id: "value-for-money", question: "Which games gave me the best and worst value for money?" },
] as const;

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

describe(".PROMPT_VARIANTS Recommendations", () => {
  const RECOMMENDATION_IDS = ["rec-upcoming", "rec-out-now", "rec-recent", "rec-throwback"];

  it.each(RECOMMENDATION_IDS)("files $id under Recommendations", (id) => {
    expect(PROMPT_VARIANTS.find((variant) => variant.id === id)?.group).toBe("Recommendations");
  });

  it.each(RECOMMENDATION_IDS)("keeps $id out of the spend-gated set", (id) => {
    expect(SPEND_VARIANTS.some((variant) => variant.id === id)).toBe(false);
  });

  it.each(RECOMMENDATION_IDS)("lists $id in the question menu", (id) => {
    const variant = PROMPT_VARIANTS.find((candidate) => candidate.id === id);

    expect(variant).toBeDefined();
    expect(buildMenu()).toContain(`- ${variant?.question}`);
  });

  it.each(RECOMMENDATION_IDS)("keeps the catalogue and price caveats for $id", (id) => {
    const instruction = PROMPT_VARIANTS.find((variant) => variant.id === id)?.instruction;

    expect(instruction).toContain("NO games catalogue");
    expect(instruction).toContain("Don't reason about price or what I paid");
  });
});

describe(".PROMPT_VARIANTS new groups", () => {
  const NEW_GROUP_IDS = {
    "Trophies & completion": [
      "closest-platinums",
      "completionist-or-mover",
      "trophies-left-on-table",
      "hardest-earned-platinums",
    ],
    "Backlog & what to play next": [
      "finish-next-owned",
      "liked-but-drifted",
      "barely-played-owned",
    ],
    "Wrapped & shareable": ["gaming-wrapped", "gaming-identity"],
  } as const;
  const EXISTING_GROUP_ADDITIONS = {
    "Engagement & enjoyment": ["binge-vs-bursts"],
    "Taste & preferences": ["genre-taste-shift", "franchise-loyalty"],
  } as const;
  const ALL_NEW_IDS = [
    ...Object.values(NEW_GROUP_IDS).flat(),
    ...Object.values(EXISTING_GROUP_ADDITIONS).flat(),
  ];

  it("declares the new groups in PROMPT_GROUPS in the agreed order", () => {
    const order = PROMPT_GROUPS.filter(
      (g) =>
        g === "Trophies & completion" ||
        g === "Backlog & what to play next" ||
        g === "Wrapped & shareable" ||
        g === "Recommendations" ||
        g === "Profile & personality" ||
        g === "Spending & value" ||
        g === "More"
    );

    expect(order).toStrictEqual([
      "Trophies & completion",
      "Recommendations",
      "Backlog & what to play next",
      "Profile & personality",
      "Wrapped & shareable",
      "Spending & value",
      "More",
    ]);
  });

  it.each([
    { id: "closest-platinums", group: "Trophies & completion" },
    { id: "completionist-or-mover", group: "Trophies & completion" },
    { id: "trophies-left-on-table", group: "Trophies & completion" },
    { id: "hardest-earned-platinums", group: "Trophies & completion" },
    { id: "finish-next-owned", group: "Backlog & what to play next" },
    { id: "liked-but-drifted", group: "Backlog & what to play next" },
    { id: "barely-played-owned", group: "Backlog & what to play next" },
    { id: "gaming-wrapped", group: "Wrapped & shareable" },
    { id: "gaming-identity", group: "Wrapped & shareable" },
    { id: "binge-vs-bursts", group: "Engagement & enjoyment" },
    { id: "genre-taste-shift", group: "Taste & preferences" },
    { id: "franchise-loyalty", group: "Taste & preferences" },
  ] as const)("files $id under $group", ({ id, group }) => {
    expect(PROMPT_VARIANTS.find((variant) => variant.id === id)?.group).toBe(group);
  });

  it.each(ALL_NEW_IDS)("keeps $id always-available rather than spend-gated", (id) => {
    expect(SPEND_VARIANTS.some((variant) => (variant.id as string) === id)).toBe(false);
  });

  it.each(ALL_NEW_IDS)("lists $id in the spend-free question menu", (id) => {
    const variant = PROMPT_VARIANTS.find((candidate) => candidate.id === id);

    expect(variant).toBeDefined();
    expect(buildMenu()).toContain(`- ${variant?.question}`);
  });

  it.each(ALL_NEW_IDS)("lists $id among the follow-ups of an unrelated lead", (id) => {
    const [lead] = PROMPT_VARIANTS;
    const variant = PROMPT_VARIANTS.find((candidate) => candidate.id === id);

    expect(variant).toBeDefined();
    expect(buildFollowUps(lead)).toContain(`- ${variant?.question}`);
  });

  it("gives the trophy and backlog groups the metric rubric but not the synthesis-only wrapped group", () => {
    expect(METRIC_RUBRIC_GROUPS.has("Trophies & completion")).toBe(true);
    expect(METRIC_RUBRIC_GROUPS.has("Backlog & what to play next")).toBe(true);
    expect(METRIC_RUBRIC_GROUPS.has("Wrapped & shareable")).toBe(false);
  });

  it.each(["finish-next-owned", "barely-played-owned"] as const)(
    "keeps $id to ownership and playtime without claiming price knowledge",
    (id) => {
      const instruction = PROMPT_VARIANTS.find((variant) => variant.id === id)?.instruction;

      expect(instruction).toContain("NO price");
    }
  );

  it.each(["gaming-wrapped", "gaming-identity"] as const)("frames $id as synthesis-only", (id) => {
    const instruction = PROMPT_VARIANTS.find((variant) => variant.id === id)?.instruction;

    expect(instruction?.toLowerCase()).toContain("synthesis");
  });

  it("is explicit that the hardest-platinum prompt has no rarity or difficulty data", () => {
    const instruction =
      PROMPT_VARIANTS.find((v) => v.id === "hardest-earned-platinums")?.instruction ?? "";

    expect(instruction).toContain("NO trophy-rarity");
  });
});

describe(".SPEND_VARIANTS", () => {
  it("gives every spend question an id unique across all variants", () => {
    const ids = [...PROMPT_VARIANTS, ...SPEND_VARIANTS].map((v) => v.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SPEND_QUESTIONS)("files $id under the Spending & value group", ({ id }) => {
    expect(SPEND_VARIANTS.find((variant) => variant.id === id)?.group).toBe("Spending & value");
  });

  it("declares the Spending & value group in PROMPT_GROUPS", () => {
    expect(PROMPT_GROUPS).toContain("Spending & value");
  });

  it.each(["spend-on-barely-played", "free-vs-paid-played"] as const)(
    "treats unmatched and free spend as unknown rather than zero for $id",
    (id) => {
      const instruction = SPEND_VARIANTS.find((variant) => variant.id === id)?.instruction;

      expect(instruction).toContain("UNKNOWN");
    }
  );
});

describe(".buildDataSummary", () => {
  it("embeds the headline totals from the dashboard meta", () => {
    const summary = buildDataSummary(Dashboard.data());

    expect(summary).toContain(
      `${Dashboard.data().meta.totalGames} games, ${Dashboard.data().meta.totalHours}h played`
    );
  });

  it("embeds the top game by hours", () => {
    const [top] = topGamesByHours(Dashboard.data(), 1);

    expect(buildDataSummary(Dashboard.data())).toContain(`${top?.name} — ${top?.hours}h`);
  });

  it("states the hours are PSN-recorded and can under-report with no per-period playtime", () => {
    const summary = buildDataSummary(Dashboard.data());

    expect(summary).toContain("every hour below is what PSN has RECORDED");
    expect(summary).toContain("PSN can under-report or miss play time");
    expect(summary).toContain("PSN reports no per-period or per-session playtime");
  });

  it("marks a game's timing as unknown when it has no play dates", () => {
    const games = Dashboard.data().games.map((g) => ({
      ...g,
      lastPlayed: undefined,
      firstPlayed: undefined,
    }));

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).toContain(", timing unknown");
  });

  it("reports a platinum-eligible game as platinum available but not earned", () => {
    const games = Dashboard.data().games.map((g) =>
      g.trophy
        ? {
            ...g,
            trophy: { ...g.trophy, hasPlatinum: true, earned: { ...g.trophy.earned, platinum: 0 } },
          }
        : g
    );

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).toContain("platinum available, not earned");
  });

  it("reports no franchises when none are detected", () => {
    const games = Dashboard.data().games.map((g) => ({ ...g, franchise: undefined }));

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).toContain("Franchises by hours:\n  (none detected)");
  });

  it("includes each game's last and first played dates on its line", () => {
    const [top] = Dashboard.data().games.toSorted((a, b) => b.hours - a.hours);

    const line = buildDataSummary(Dashboard.data())
      .split("\n")
      .find((l) => l.includes(`${top?.name} —`));

    expect(line).toContain(`last played ${fmtDate(top?.lastPlayed)}`);
    expect(line).toContain(`first played ${fmtDate(top?.firstPlayed)}`);
  });

  it("lists every game in the library, not just a top slice", () => {
    const summary = buildDataSummary(Dashboard.data());

    const gameLines = summary.split("\n").filter((line) => /^ {2}\d+\. /.test(line));

    expect(gameLines).toHaveLength(Dashboard.data().games.length);
  });

  it("includes every genre bucket, not just a top slice", () => {
    const summary = buildDataSummary(Dashboard.data());
    const genres = [...new Set(Dashboard.data().games.map((g) => g.genre))];

    const present = genres.map((genre) => summary.includes(`- ${genre}:`));

    expect(present).toStrictEqual(genres.map(() => true));
  });

  it("reports earned trophy counts and platinum status for every game with trophy data", () => {
    const summary = buildDataSummary(Dashboard.data());
    const withTrophy = Dashboard.data().games.filter(
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
    const games = Dashboard.data().games.map((g) => ({ ...g, trophy: undefined }));

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).toContain("trophies unknown (no data)");
  });

  it("compares lifetime hours against the typical playtime when RAWG has one", () => {
    const [top] = Dashboard.data().games.toSorted((a, b) => b.hours - a.hours);
    const games = Dashboard.data().games.map((g) =>
      g.titleId === top?.titleId ? { ...g, typicalPlaytime: 25 } : g
    );

    const line = buildDataSummary({ ...Dashboard.data(), games })
      .split("\n")
      .find((l) => l.includes(`${top?.name} —`));

    const ratio = ((top?.hours ?? 0) / 25).toFixed(1);

    expect(line).toContain(
      `you: ${Math.round(top?.hours ?? 0)}h lifetime vs typical ~25h (~${ratio}x)`
    );
  });

  it("omits the playtime comparison for games without a typical playtime", () => {
    const games = Dashboard.data().games.map((g) => ({ ...g, typicalPlaytime: undefined }));

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).not.toContain("vs typical ~");
  });

  it("includes the completionist baseline with the account platinums and platinum rate", () => {
    const eligible = Dashboard.data().games.filter((g) => g.trophy?.hasPlatinum === true);
    const platinumed = eligible.filter((g) => (g.trophy?.earned.platinum ?? 0) >= 1);
    const rate = Math.round((platinumed.length / eligible.length) * 100);

    const summary = buildDataSummary(Dashboard.data());

    expect(summary).toContain(
      `Completionist baseline: ${Dashboard.data().profile.earned.platinum} platinums earned account-wide; platinumed ${platinumed.length} of ${eligible.length} platinum-eligible games with trophy data (${rate}% platinum rate)`
    );
  });

  it("degrades the platinum rate gracefully when no game has a platinum available", () => {
    const games = Dashboard.data().games.map((g) => ({ ...g, trophy: undefined }));

    const summary = buildDataSummary({ ...Dashboard.data(), games });

    expect(summary).toContain(
      "platinumed 0 of 0 platinum-eligible games with trophy data (no platinum-eligible games with trophy data, so no rate)"
    );
  });

  it("includes matched per-game add-on counts from imported transactions", () => {
    const [game] = Dashboard.data().games;
    const summary = buildDataSummary(Dashboard.data(), [
      Transactions.row({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
    ]);

    expect(summary).toContain(`${game?.name} —`);
    expect(summary).toContain("add-ons purchased: 1");
  });

  it("omits add-on transaction lines when no transactions are imported", () => {
    const summary = buildDataSummary(Dashboard.data());

    expect(summary).not.toContain("add-ons purchased");
    expect(summary).not.toContain("Imported transaction signal");
  });

  it("surfaces per-game purchase-price context when spend matches the base game", () => {
    const [game] = Dashboard.data().games;
    const summary = buildDataSummary(Dashboard.data(), [
      Transactions.row({
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
    const summary = buildDataSummary(Dashboard.data());

    expect(summary).not.toContain("bought:");
  });

  it("surfaces account-wide spend totals and wallet top-ups from imported transactions", () => {
    const [game] = Dashboard.data().games;

    const summary = buildDataSummary(Dashboard.data(), [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
      Transactions.row({
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
    const [game] = Dashboard.data().games;

    const summary = buildDataSummary(Dashboard.data(), [
      Transactions.row({
        productName: game?.name ?? "",
        skuId: game?.titleId,
        amountMinor: 4499,
        date: "2023-05-01",
      }),
    ]);

    expect(summary).toContain("Spend by year: 2023 £44.99 (1 purchases)");
  });

  it("lists matched games by cost per hour played, lowest first", () => {
    const [game] = Dashboard.data().games;
    const transactions = [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ];
    const [leader] = summariseSpend(Dashboard.data(), transactions).leaderboard;

    const summary = buildDataSummary(Dashboard.data(), transactions);

    expect(summary).toContain(
      "Cost per hour played (matched purchases, lowest first — total matched spend ÷ lifetime hours):"
    );
    expect(summary).toContain(
      `${leader?.name}: £${leader?.spend.toFixed(2)} over ${Math.round(leader?.hours ?? 0)}h (£${leader?.perHour.toFixed(2)}/h)`
    );
  });

  it("omits the spend block when no transactions are imported", () => {
    const summary = buildDataSummary(Dashboard.data());

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

  it.each(SPEND_QUESTIONS)(
    "omits the $id spend question when no transactions are imported",
    ({ question }) => {
      const [lead] = PROMPT_VARIANTS;

      expect(buildFollowUps(lead)).not.toContain(`- ${question}`);
    }
  );

  it.each(SPEND_QUESTIONS)(
    "lists the $id spend question when transactions are imported",
    ({ question }) => {
      const [lead] = PROMPT_VARIANTS;
      const [game] = Dashboard.data().games;
      const followUps = buildFollowUps(lead, [
        Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
      ]);

      expect(followUps).toContain(`- ${question}`);
    }
  );
});

describe(".buildPrompt", () => {
  it.each(PROMPT_VARIANTS)("leads with the $id instruction over the shared data", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt).toContain(`TASK: ${variant.instruction}`);
    expect(prompt).toContain(buildDataSummary(Dashboard.data()));
  });

  it.each(PROMPT_VARIANTS)("embeds the data summary exactly once for $id", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt.split("DATA (my PlayStation playtime, lifetime totals):")).toHaveLength(2);
  });

  it.each(PROMPT_VARIANTS)("appends the follow-up menu for $id", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt).toContain(buildFollowUps(variant));
  });

  it.each(PROMPT_VARIANTS)("tells the model to weigh recency over raw hours for $id", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt).toContain("Weigh WHEN I played (recency and trends");
  });

  it("gives each variant a distinct prompt body", () => {
    const prompts = PROMPT_VARIANTS.map((v) => buildPrompt(Dashboard.data(), v));

    expect(new Set(prompts).size).toBe(PROMPT_VARIANTS.length);
  });

  it.each(PROMPT_VARIANTS)("includes the genre on every game's line for $id", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

    const present = Dashboard.data().games.map((g) => {
      const line = prompt.split("\n").find((l) => l.includes(`${g.name} —`));
      return line?.includes(`(${g.genre}`);
    });

    expect(present).toStrictEqual(Dashboard.data().games.map(() => true));
  });

  it.each(PROMPT_VARIANTS)("embeds the global metric caveat for $id", (variant) => {
    const prompt = buildPrompt(Dashboard.data(), variant);

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
      const prompt = buildPrompt(Dashboard.data(), variant);

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
      const prompt = buildPrompt(Dashboard.data(), variant);

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
      const prompt = buildPrompt(Dashboard.data(), variant);

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
      const prompt = buildPrompt(Dashboard.data(), variant);

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
    const [game] = Dashboard.data().games;
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(Dashboard.data(), variant, [
      Transactions.row({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
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
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt).not.toContain(ADD_ON_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain("add-ons purchased");
  });

  it("embeds price-context guidance when imported transactions match a base game", () => {
    const [game] = Dashboard.data().games;
    const [variant] = PROMPT_VARIANTS;
    const prompt = buildPrompt(Dashboard.data(), variant, [
      Transactions.row({
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
    const prompt = buildPrompt(Dashboard.data(), variant);

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
    const [game] = Dashboard.data().games;
    const [variant] = PROMPT_VARIANTS;

    const prompt = buildPrompt(Dashboard.data(), variant, [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ]);

    expect(prompt).toContain(SPEND_SIGNAL_GUIDANCE);
  });

  it("omits spend guidance when no transactions are imported", () => {
    const [variant] = PROMPT_VARIANTS;

    const prompt = buildPrompt(Dashboard.data(), variant);

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
    const prompt = buildPrompt(Dashboard.data(), variant);

    expect(prompt).not.toContain(TROPHY_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(PLAYTIME_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(COMPLETION_INTERPRETATION_GUIDANCE);
  });

  it.each(SOFT_LEADS)(
    "keeps the global caveat and genre play-pattern for the soft lead $id",
    (variant) => {
      const prompt = buildPrompt(Dashboard.data(), variant);

      expect(prompt).toContain(METRIC_GUIDANCE_CAVEAT);
      expect(prompt).toContain(PLAY_PATTERN_GUIDANCE);
    }
  );

  it.each(SOFT_LEADS)(
    "gates add-on and price guidance off for the soft lead $id even with matching transactions",
    (variant) => {
      const [game] = Dashboard.data().games;

      const prompt = buildPrompt(Dashboard.data(), variant, [
        Transactions.row({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
        Transactions.row({
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
      expect(buildPrompt(Dashboard.data(), variant, [])).toBe(
        buildPrompt(Dashboard.data(), variant)
      );
    }
  );

  it.each(PROMPT_VARIANTS)(
    "leaves the lead-question prompt unchanged when menu mode is added for $id",
    (variant) => {
      expect(buildPrompt(Dashboard.data(), variant)).toContain(`TASK: ${variant.instruction}`);
      expect(buildPrompt(Dashboard.data(), MENU_MODE)).not.toBe(
        buildPrompt(Dashboard.data(), variant)
      );
    }
  );
});

describe(".buildMenu", () => {
  it.each([
    "enjoyment-vs-time",
    "engaging-genres",
    "lost-interest-fastest",
    "session-balance",
    "mechanics-return",
    "binge-vs-bursts",
    "finish-vs-abandon",
    "typical-completion",
    "time-no-progress",
    "finishing-blockers",
    "closest-platinums",
    "completionist-or-mover",
    "trophies-left-on-table",
    "hardest-earned-platinums",
    "hidden-preferences",
    "taste-over-time",
    "consistent-franchises",
    "outliers",
    "genre-taste-shift",
    "franchise-loyalty",
    "another-chance",
    "one-backlog-pick",
    "rec-upcoming",
    "rec-out-now",
    "rec-recent",
    "rec-throwback",
    "finish-next-owned",
    "liked-but-drifted",
    "barely-played-owned",
    "personality-traits",
    "profile-paragraph",
    "someone-else",
    "gaming-wrapped",
    "gaming-identity",
    "binge-vs-steady",
    "revivals",
    "under-explored-genre",
    "efficient-completionist",
    "signature-genre",
    "last-12-months",
    "comfort-vs-one-and-done",
    "top-10-ranking",
  ])("lists the authored $id question under its category", (id) => {
    const variant = PROMPT_VARIANTS.find((candidate) => candidate.id === id);

    expect(variant).toBeDefined();
    expect(buildMenu()).toContain(`${variant?.group}:`);
    expect(buildMenu()).toContain(`- ${variant?.question}`);
  });

  it("omits the spend group when no transactions are imported", () => {
    expect(buildMenu()).not.toContain("Spending & value:");
  });

  it.each(SPEND_QUESTIONS)(
    "omits $id from the menu when no transactions are imported",
    ({ question }) => {
      expect(buildMenu()).not.toContain(`- ${question}`);
    }
  );

  it("folds in the spend group when transactions are imported", () => {
    const [game] = Dashboard.data().games;

    const menu = buildMenu([
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    expect(menu).toContain("Spending & value:");
  });

  it.each(SPEND_QUESTIONS)(
    "lists $id in the menu when transactions are imported",
    ({ question }) => {
      const [game] = Dashboard.data().games;
      const menu = buildMenu([
        Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
      ]);

      expect(menu).toContain(`- ${question}`);
    }
  );
});

describe(".buildPrompt (menu mode)", () => {
  it("replaces the TASK analysis lead with the menu instruction", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).not.toContain("TASK:");
    expect(prompt).toContain(MENU_INSTRUCTION);
  });

  it("does not embed any lead question's analysis instruction", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    const embedded = PROMPT_VARIANTS.map((v) => prompt.includes(v.instruction));

    expect(embedded).toStrictEqual(PROMPT_VARIANTS.map(() => false));
  });

  it("presents the full grouped question menu", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).toContain(buildMenu());
  });

  it("still embeds the data summary exactly once", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).toContain(buildDataSummary(Dashboard.data()));
    expect(prompt.split("DATA (my PlayStation playtime, lifetime totals):")).toHaveLength(2);
  });

  it("keeps the always-on global caveat and genre play-pattern guidance", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).toContain(METRIC_GUIDANCE_CAVEAT);
    expect(prompt).toContain(PLAY_PATTERN_GUIDANCE);
  });

  it("defers the per-metric calibration rubric until a question is picked", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).not.toContain(TROPHY_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(PLAYTIME_SIGNAL_GUIDANCE);
    expect(prompt).not.toContain(COMPLETION_INTERPRETATION_GUIDANCE);
  });

  it("defers the add-on and price rubric even when transactions match", () => {
    const [game] = Dashboard.data().games;

    const prompt = buildPrompt(Dashboard.data(), MENU_MODE, [
      Transactions.row({ productName: `${game?.name} Season Pass`, skuId: game?.titleId }),
      Transactions.row({
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
    const [game] = Dashboard.data().games;

    const prompt = buildPrompt(Dashboard.data(), MENU_MODE, [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId, amountMinor: 4499 }),
    ]);

    expect(prompt).toContain("Spend (imported transaction history):");
    expect(prompt).not.toContain(SPEND_SIGNAL_GUIDANCE);
  });

  it("folds the spend group into the menu when transactions are imported", () => {
    const [game] = Dashboard.data().games;
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE, [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    expect(prompt).toContain("Spending & value:");
  });

  it.each(SPEND_QUESTIONS)(
    "folds the $id spend question into the menu when transactions are imported",
    ({ question }) => {
      const [game] = Dashboard.data().games;
      const prompt = buildPrompt(Dashboard.data(), MENU_MODE, [
        Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
      ]);

      expect(prompt).toContain(`- ${question}`);
    }
  );

  it("leaves the no-transactions menu prompt byte-identical to the undefined case", () => {
    expect(buildPrompt(Dashboard.data(), MENU_MODE, [])).toBe(
      buildPrompt(Dashboard.data(), MENU_MODE)
    );
  });

  it("keeps the menu instruction's enumerated group list spend-free without transactions", () => {
    const prompt = buildPrompt(Dashboard.data(), MENU_MODE);

    expect(prompt).toContain(MENU_INSTRUCTION);
    expect(prompt).not.toContain("Wrapped & shareable, Spending & value, More)");
  });

  it("adds the spend group to the menu instruction's enumerated list with transactions", () => {
    const [game] = Dashboard.data().games;

    const prompt = buildPrompt(Dashboard.data(), MENU_MODE, [
      Transactions.row({ productName: game?.name ?? "", skuId: game?.titleId }),
    ]);

    expect(prompt).toContain("Wrapped & shareable, Spending & value, More)");
  });
});
