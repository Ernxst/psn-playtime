import { describe, expect, it } from "vitest";
import type { GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import { buildAccountCsv, buildGamesCsv } from "./csv";
import { importDashboardFromCsv } from "./import-dashboard";

/** A fully-populated game so every optional column takes part in the round-trip. */
function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: "PPSA01234",
    name: "Hades",
    imageUrl: "https://img/hades",
    platform: "PS5",
    hours: 42.5,
    playCount: 30,
    firstPlayed: "2024-01-10",
    lastPlayed: "2025-02-20",
    category: "ps5_native_game",
    genre: "Action-Adventure",
    franchise: "Hades",
    typicalPlaytime: 21,
    isApp: false,
    trophy: {
      progress: 80,
      earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
      total: 10,
      hasPlatinum: true,
      lastEarnedAt: "2025-02-19",
    },
    ...overrides,
  };
}

// A second title that OMITS the optional columns (no franchise/image/category/
// typicalPlaytime), so the importer must reconstruct it with those keys absent —
// exactly as a real decoded snapshot carries them.
const celeste: GamePlay = {
  titleId: "PPSA09999",
  name: "Celeste",
  platform: "PS4",
  hours: 12,
  playCount: 8,
  firstPlayed: "2023-05-01",
  lastPlayed: "2023-08-01",
  genre: "Indie/Casual",
  isApp: false,
  trophy: {
    progress: 40,
    earned: { platinum: 0, gold: 1, silver: 2, bronze: 5 },
    total: 8,
    hasPlatinum: false,
    lastEarnedAt: "2023-07-30",
  },
};

const games: GamePlay[] = [game({}), celeste];

const appsExcluded = [
  { name: "Netflix", hours: 30 },
  { name: "YouTube", hours: 3.5 },
];

// earned = sum of the two games' earned counts; totalTrophies = their sum.
const original = Dashboard.data({
  profile: {
    onlineId: "Ernxst_",
    accountId: "acc-1",
    aboutMe: "hi there",
    avatarUrl: "https://a/avatar",
    isPlus: true,
    trophyLevel: 220,
    levelProgress: 47,
    earned: { platinum: 1, gold: 3, silver: 5, bronze: 9 },
    totalTrophies: 18,
  },
  games,
  fetchedAt: "2025-03-01T00:00:00.000Z",
  meta: {
    totalGames: 2,
    totalHours: 54.5,
    totalSessions: 38,
    appsExcluded,
    firstEverPlayed: "2023-05-01",
    span: { from: "2023-05-01", to: "2025-02-20" },
  },
  isDemo: false,
  trophiesUnavailable: false,
});

describe("importDashboardFromCsv", () => {
  it("round-trips a dashboard through the games + account CSVs (fetchedAt aside)", () => {
    const gamesCsv = buildGamesCsv(original.games, original.meta.appsExcluded);
    const accountCsv = buildAccountCsv(original.profile);

    const imported = importDashboardFromCsv(gamesCsv, accountCsv);

    // fetchedAt is not carried on either CSV; the importer stamps it fresh.
    const { fetchedAt: _f, ...restImported } = imported;
    const { fetchedAt: _o, ...restOriginal } = original;

    expect(restImported).toStrictEqual(restOriginal);
  });

  it("stamps a fresh ISO fetchedAt and never marks imported data as demo", () => {
    const imported = importDashboardFromCsv(
      buildGamesCsv(original.games, original.meta.appsExcluded),
      buildAccountCsv(original.profile)
    );

    expect(imported.isDemo).toBe(false);
    expect(imported.trophiesUnavailable).toBe(false);
    expect(Number.isNaN(Date.parse(imported.fetchedAt))).toBe(false);
  });

  it("splits kind=game into games and kind=app into meta.appsExcluded", () => {
    const imported = importDashboardFromCsv(
      buildGamesCsv(original.games, original.meta.appsExcluded),
      buildAccountCsv(original.profile)
    );

    expect(imported.games.map((g) => g.name)).toStrictEqual(["Hades", "Celeste"]);
    expect(imported.games.every((g) => g.isApp === false)).toBe(true);
    expect(imported.meta.appsExcluded).toStrictEqual(appsExcluded);
  });

  it("derives profile.earned and totalTrophies by summing the game trophy rows", () => {
    const imported = importDashboardFromCsv(
      buildGamesCsv(original.games, original.meta.appsExcluded),
      buildAccountCsv(original.profile)
    );

    expect(imported.profile.earned).toStrictEqual({ platinum: 1, gold: 3, silver: 5, bronze: 9 });
    expect(imported.profile.totalTrophies).toBe(18);
  });

  it("recomputes meta totals, firstEverPlayed and span from the game rows", () => {
    const imported = importDashboardFromCsv(
      buildGamesCsv(original.games, original.meta.appsExcluded),
      buildAccountCsv(original.profile)
    );

    expect(imported.meta.totalGames).toBe(2);
    expect(imported.meta.totalHours).toBe(54.5);
    expect(imported.meta.totalSessions).toBe(38);
    expect(imported.meta.firstEverPlayed).toBe("2023-05-01");
    expect(imported.meta.span).toStrictEqual({ from: "2023-05-01", to: "2025-02-20" });
  });

  it("reconstructs a game with no trophy and excludes it from the earned totals", () => {
    const noTrophy: GamePlay = {
      titleId: "PPSA00001",
      name: "Tetris",
      platform: "PS4",
      hours: 5,
      playCount: 3,
      genre: "Other",
      isApp: false,
    };

    const imported = importDashboardFromCsv(
      buildGamesCsv([noTrophy], []),
      buildAccountCsv(original.profile)
    );

    expect(imported.games[0]?.trophy).toBeUndefined();
    expect(imported.profile.earned).toStrictEqual({ platinum: 0, gold: 0, silver: 0, bronze: 0 });
    expect(imported.profile.totalTrophies).toBe(0);
  });

  it("throws a clear error when the account CSV has no data row", () => {
    expect(() => importDashboardFromCsv(buildGamesCsv([], []), "online_id,account_id\n")).toThrow(
      /no data row/i
    );
  });

  it("throws a decode error on a malformed games CSV (unknown genre)", () => {
    const bad = buildGamesCsv([game({ genre: "Action-Adventure" })], []).replace(
      "Action-Adventure",
      "Wizardry"
    );

    expect(() => importDashboardFromCsv(bad, buildAccountCsv(original.profile))).toThrow(
      /Wizardry/
    );
  });

  it("throws a decode error on a malformed account CSV (non-numeric trophy level)", () => {
    const badAccount = buildAccountCsv(original.profile).replace(",220,", ",abc,");

    expect(() => importDashboardFromCsv(buildGamesCsv([], []), badAccount)).toThrow(
      /finite number, got NaN/
    );
  });
});
