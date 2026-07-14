import { describe, expect, it } from "vitest";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { longestRecordedSpan, playProfile } from "./profile";

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: "game",
    name: "Game",
    platform: "PS5",
    hours: 10,
    playCount: 2,
    genre: "Other",
    isApp: false,
    ...overrides,
  };
}

function data(games: GamePlay[], overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    profile: {
      onlineId: "player",
      accountId: "account",
      isPlus: false,
      trophyLevel: 1,
      levelProgress: 0,
      earned: { platinum: 2, gold: 0, silver: 0, bronze: 0 },
      totalTrophies: 2,
    },
    games,
    fetchedAt: "2026-01-01",
    meta: {
      totalGames: games.length,
      totalHours: games.reduce((total, item) => total + item.hours, 0),
      totalSessions: games.reduce((total, item) => total + item.playCount, 0),
      appsExcluded: [],
      span: {},
    },
    isDemo: false,
    trophiesUnavailable: false,
    ...overrides,
  };
}

describe(".longestRecordedSpan", () => {
  it("selects the longest valid multi-launch span from the full library", () => {
    const longest = game({
      titleId: "longest",
      name: "Longest",
      hours: 5,
      playCount: 3,
      firstPlayed: "2018-01-01",
      lastPlayed: "2020-01-01",
    });
    const higherHours = game({
      titleId: "higher-hours",
      name: "Higher hours",
      hours: 100,
      firstPlayed: "2019-01-01",
      lastPlayed: "2019-02-01",
    });

    expect(longestRecordedSpan(data([higherHours, longest]))).toEqual({
      game: longest,
      days: 730,
    });
  });

  it("ignores invalid dates and single-launch titles", () => {
    const invalid = game({ firstPlayed: "invalid", lastPlayed: "2020-01-01" });
    const single = game({ playCount: 1, firstPlayed: "2018-01-01", lastPlayed: "2020-01-01" });

    expect(longestRecordedSpan(data([invalid, single]))).toBeUndefined();
  });
});

describe(".playProfile", () => {
  it("uses enriched genre and franchise facts before the top game", () => {
    const profile = playProfile(
      data(
        [
          game({ name: "Alpha", hours: 75, genre: "RPG", franchise: "Alpha series" }),
          game({ name: "Beta", hours: 25, genre: "Shooter", franchise: "Beta series" }),
        ],
        { enriched: true }
      )
    );

    expect(profile.centre).toBe(
      "Your centre of gravity is RPG: 75 h recorded across 1 game (75% of this library). Alpha series is your leading franchise with 75 h recorded across 1 game. Alpha is your top game with 75 h recorded (75% of this library)."
    );
  });

  it("leads with the top game while enrichment is partial", () => {
    const profile = playProfile(
      data([game({ name: "Alpha", hours: 75, genre: "RPG", franchise: "Alpha series" })])
    );

    expect(profile.centre).toBe(
      "Alpha is your top game with 75 h recorded (100% of this library)."
    );
  });

  it("reports trophy denominators and coverage without classifying the player", () => {
    const profile = playProfile(
      data([
        game({
          trophy: {
            progress: 100,
            earned: { platinum: 1, gold: 0, silver: 0, bronze: 0 },
            total: 1,
            hasPlatinum: true,
          },
        }),
        game({ titleId: "unknown", name: "Unknown" }),
      ])
    );

    expect(profile.trophies).toBe(
      "Your matched trophy data covers 1 of 2 games (50%). You have completed 1 of those 1 matched list and earned 1 platinum."
    );
  });

  it("omits trophy claims when trophy data is unavailable", () => {
    const profile = playProfile(data([game({})], { trophiesUnavailable: true }));

    expect(profile.trophies).toBeUndefined();
    expect(profile.trophyNotice).toBe(
      "Trophy data was unavailable, so it is not included in this profile."
    );
    expect(profile.copy).not.toContain("trophy");
  });
});
