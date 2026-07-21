import { describe, expect, it } from "vitest";
import type {
  DashboardData,
  GamePlay,
  GameTrophy,
  ProfileSummary,
  TrophyCounts,
} from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import { summariseTrophies } from "./trophies";

const noTrophies: TrophyCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

const baseProfile: ProfileSummary = {
  onlineId: "tester",
  accountId: "acc",
  isPlus: false,
  trophyLevel: 220,
  levelProgress: 64,
  earned: { platinum: 12, gold: 30, silver: 80, bronze: 400 },
  totalTrophies: 522,
};

interface GameOptions {
  titleId?: string;
  name?: string;
  imageUrl?: string;
  trophy?: GameTrophy;
}

/** Build a played title; pass `trophy` to make it a matched game. */
function makeGame({ titleId = "t", name = "Game", imageUrl, trophy }: GameOptions = {}): GamePlay {
  return {
    ...Dashboard.data().games[0]!,
    titleId,
    name,
    imageUrl,
    trophy: undefined,
    ...(trophy && { trophy }),
  };
}

/** Build a matched trophy list with sensible defaults. */
function makeTrophy(overrides: Partial<GameTrophy> = {}): GameTrophy {
  return {
    progress: 50,
    earned: { ...noTrophies },
    total: 40,
    hasPlatinum: true,
    ...overrides,
  };
}

function makeData(games: GamePlay[], profile: ProfileSummary = baseProfile): DashboardData {
  return Dashboard.data({
    profile,
    games,
    fetchedAt: "2024-01-01T00:00:00.000Z",
    meta: { totalGames: games.length, totalHours: 0, totalSessions: 0, appsExcluded: [], span: {} },
    isDemo: false,
    trophiesUnavailable: false,
  });
}

describe(".summariseTrophies", () => {
  it("copies account totals straight from the profile", () => {
    const summary = summariseTrophies(makeData([]));

    expect(summary.trophyLevel).toBe(220);
    expect(summary.levelProgress).toBe(64);
    expect(summary.totalTrophies).toBe(522);
    expect(summary.earned).toStrictEqual({ platinum: 12, gold: 30, silver: 80, bronze: 400 });
  });

  it("reports the earned distribution in descending tier order", () => {
    const summary = summariseTrophies(makeData([]));

    expect(summary.distribution).toStrictEqual([
      { type: "Platinum", count: 12 },
      { type: "Gold", count: 30 },
      { type: "Silver", count: 80 },
      { type: "Bronze", count: 400 },
    ]);
  });

  it("counts every title in the library as the total denominator", () => {
    const data = makeData([
      makeGame({ titleId: "a", trophy: makeTrophy() }),
      makeGame({ titleId: "b" }),
      makeGame({ titleId: "c" }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.totalGames).toBe(3);
  });

  it("scopes the matched denominator to titles carrying a trophy list", () => {
    const data = makeData([
      makeGame({ titleId: "a", trophy: makeTrophy() }),
      makeGame({ titleId: "b", trophy: makeTrophy() }),
      makeGame({ titleId: "c" }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.matchedGames).toBe(2);
  });

  it("excludes unmatched UNKNOWN titles from per-game collections", () => {
    const data = makeData([
      makeGame({
        titleId: "matched",
        trophy: makeTrophy({
          progress: 100,
          earned: { ...noTrophies, platinum: 1 },
          lastEarnedAt: "2024-05-01",
        }),
      }),
      makeGame({ titleId: "unknown" }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.platinums.map((game) => game.titleId)).toStrictEqual(["matched"]);
    expect(summary.recent.map((game) => game.titleId)).toStrictEqual(["matched"]);
    expect(summary.completedGames).toBe(1);
  });

  it("flattens a matched game into a chart-ready row", () => {
    const data = makeData([
      makeGame({
        titleId: "flat",
        name: "Flat Game",
        imageUrl: "https://img/flat.png",
        trophy: makeTrophy({
          progress: 75,
          earned: { ...noTrophies, gold: 2 },
          hasPlatinum: false,
          lastEarnedAt: "2024-03-03",
        }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.recent[0]).toStrictEqual({
      titleId: "flat",
      name: "Flat Game",
      imageUrl: "https://img/flat.png",
      progress: 75,
      earned: { platinum: 0, gold: 2, silver: 0, bronze: 0 },
      hasPlatinum: false,
      lastEarnedAt: "2024-03-03",
    });
  });

  it("averages completion across matched games and rounds the mean", () => {
    const data = makeData([
      makeGame({ titleId: "a", trophy: makeTrophy({ progress: 50 }) }),
      makeGame({ titleId: "b", trophy: makeTrophy({ progress: 75 }) }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.avgCompletion).toBe(63);
  });

  it("ignores unmatched titles when averaging completion", () => {
    const data = makeData([
      makeGame({ titleId: "a", trophy: makeTrophy({ progress: 40 }) }),
      makeGame({ titleId: "b", trophy: makeTrophy({ progress: 60 }) }),
      makeGame({ titleId: "unknown" }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.avgCompletion).toBe(50);
  });

  it("reports zero average completion when no game matched", () => {
    const data = makeData([makeGame({ titleId: "unknown" })]);

    const summary = summariseTrophies(data);

    expect(summary.avgCompletion).toBe(0);
  });

  it("counts only fully completed matched games", () => {
    const data = makeData([
      makeGame({ titleId: "done", trophy: makeTrophy({ progress: 100 }) }),
      makeGame({ titleId: "nearly", trophy: makeTrophy({ progress: 99 }) }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.completedGames).toBe(1);
  });

  it("lists platted games most-recent platinum first", () => {
    const data = makeData([
      makeGame({
        titleId: "old",
        trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 }, lastEarnedAt: "2024-01-01" }),
      }),
      makeGame({
        titleId: "new",
        trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 }, lastEarnedAt: "2024-06-01" }),
      }),
      makeGame({ titleId: "noplat", trophy: makeTrophy({ earned: { ...noTrophies } }) }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.platinums.map((game) => game.titleId)).toStrictEqual(["new", "old"]);
  });

  it("sorts platted games with no earned date last", () => {
    const data = makeData([
      makeGame({
        titleId: "undated",
        trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 } }),
      }),
      makeGame({
        titleId: "dated",
        trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 }, lastEarnedAt: "2024-04-04" }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.platinums.map((game) => game.titleId)).toStrictEqual(["dated", "undated"]);
  });

  it("keeps platted games with no earned date on either side", () => {
    const data = makeData([
      makeGame({ titleId: "a", trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 } }) }),
      makeGame({ titleId: "b", trophy: makeTrophy({ earned: { ...noTrophies, platinum: 1 } }) }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.platinums.map((game) => game.titleId)).toStrictEqual(["a", "b"]);
  });

  it("sorts games with no earned date last in recency order", () => {
    const data = makeData([
      makeGame({ titleId: "dated", trophy: makeTrophy({ lastEarnedAt: "2024-02-02" }) }),
      makeGame({ titleId: "undated", trophy: makeTrophy() }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.recent.map((game) => game.titleId)).toStrictEqual(["dated"]);
  });

  it("includes plat-capable games at or above the reach threshold without a platinum", () => {
    const data = makeData([
      makeGame({
        titleId: "reach",
        trophy: makeTrophy({ progress: 80, hasPlatinum: true, earned: { ...noTrophies } }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.withinReach.map((game) => game.titleId)).toStrictEqual(["reach"]);
  });

  it("excludes already-platted games from within reach", () => {
    const data = makeData([
      makeGame({
        titleId: "platted",
        trophy: makeTrophy({
          progress: 95,
          hasPlatinum: true,
          earned: { ...noTrophies, platinum: 1 },
        }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.withinReach).toStrictEqual([]);
  });

  it("excludes games below the reach threshold from within reach", () => {
    const data = makeData([
      makeGame({
        titleId: "low",
        trophy: makeTrophy({ progress: 79, hasPlatinum: true, earned: { ...noTrophies } }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.withinReach).toStrictEqual([]);
  });

  it("excludes games with no platinum on offer from within reach", () => {
    const data = makeData([
      makeGame({
        titleId: "noplat",
        trophy: makeTrophy({ progress: 90, hasPlatinum: false, earned: { ...noTrophies } }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.withinReach).toStrictEqual([]);
  });

  it("orders within-reach games closest to the platinum first", () => {
    const data = makeData([
      makeGame({
        titleId: "near",
        trophy: makeTrophy({ progress: 82, hasPlatinum: true, earned: { ...noTrophies } }),
      }),
      makeGame({
        titleId: "nearer",
        trophy: makeTrophy({ progress: 95, hasPlatinum: true, earned: { ...noTrophies } }),
      }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.withinReach.map((game) => game.titleId)).toStrictEqual(["nearer", "near"]);
  });

  it("buckets matched games across the completion spectrum", () => {
    const data = makeData([
      makeGame({ titleId: "completed", trophy: makeTrophy({ progress: 100 }) }),
      makeGame({ titleId: "high", trophy: makeTrophy({ progress: 80 }) }),
      makeGame({ titleId: "mid", trophy: makeTrophy({ progress: 40 }) }),
      makeGame({ titleId: "low", trophy: makeTrophy({ progress: 39 }) }),
      makeGame({ titleId: "unknown" }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.completionBuckets).toStrictEqual([
      { label: "Completed (100%)", count: 1 },
      { label: "Almost there (80–99%)", count: 1 },
      { label: "Halfway (40–79%)", count: 1 },
      { label: "Just started (<40%)", count: 1 },
    ]);
  });

  it("lists only matched games with trophy activity, most recently earned first", () => {
    const data = makeData([
      makeGame({ titleId: "earliest", trophy: makeTrophy({ lastEarnedAt: "2023-01-01" }) }),
      makeGame({ titleId: "latest", trophy: makeTrophy({ lastEarnedAt: "2024-12-31" }) }),
      makeGame({ titleId: "silent", trophy: makeTrophy() }),
    ]);

    const summary = summariseTrophies(data);

    expect(summary.recent.map((game) => game.titleId)).toStrictEqual(["latest", "earliest"]);
  });

  it("returns empty collections and zero counts for an empty library", () => {
    const summary = summariseTrophies(makeData([]));

    expect(summary.totalGames).toBe(0);
    expect(summary.matchedGames).toBe(0);
    expect(summary.avgCompletion).toBe(0);
    expect(summary.completedGames).toBe(0);
    expect(summary.platinums).toStrictEqual([]);
    expect(summary.withinReach).toStrictEqual([]);
    expect(summary.recent).toStrictEqual([]);
    expect(summary.completionBuckets).toStrictEqual([
      { label: "Completed (100%)", count: 0 },
      { label: "Almost there (80–99%)", count: 0 },
      { label: "Halfway (40–79%)", count: 0 },
      { label: "Just started (<40%)", count: 0 },
    ]);
  });

  it("summarises the bundled demo dataset consistently with its profile", () => {
    const data = Dashboard.data();
    const summary = summariseTrophies(data);

    expect(summary.trophyLevel).toBe(data.profile.trophyLevel);
    expect(summary.totalTrophies).toBe(data.profile.totalTrophies);
    expect(summary.totalGames).toBe(data.games.length);
    expect(summary.matchedGames).toBe(data.games.filter((game) => game.trophy).length);
    expect(summary.matchedGames).toBeLessThanOrEqual(summary.totalGames);
  });
});
