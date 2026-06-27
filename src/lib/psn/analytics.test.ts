import { describe, expect, it } from "vitest";
import {
  bingeVsDipIn,
  filterByTimeframe,
  genreBreakdown,
  headlineTotals,
  hoursByYear,
  lifespans,
  recency,
  topFranchises,
  topGamesByHours,
  valuePerGame,
} from "./analytics";
import { demoDashboard } from "./mock";
import type { DashboardData } from "./types";

/** Small hand-built library with exactly-known aggregates. */
const sample: DashboardData = {
  profile: {
    onlineId: "tester",
    accountId: "acc",
    isPlus: false,
    trophyLevel: 5,
    levelProgress: 0,
    earned: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
    totalTrophies: 0,
  },
  games: [
    {
      titleId: "A",
      name: "A",
      platform: "PS5",
      hours: 100,
      playCount: 10,
      genre: "Shooter",
      franchise: "Call of Duty",
      firstPlayed: "2020-01-01",
      lastPlayed: "2021-01-01",
      isApp: false,
    },
    {
      titleId: "B",
      name: "B",
      platform: "PS4",
      hours: 50,
      playCount: 5,
      genre: "Shooter",
      franchise: "Call of Duty",
      firstPlayed: "2019-01-01",
      lastPlayed: "2019-06-01",
      isApp: false,
    },
    {
      titleId: "C",
      name: "C",
      platform: "PS5",
      hours: 50,
      playCount: 25,
      genre: "RPG",
      franchise: "The Witcher",
      firstPlayed: "2022-01-01",
      lastPlayed: "2022-02-01",
      isApp: false,
    },
    {
      titleId: "D",
      name: "D",
      platform: "PS4",
      hours: 0,
      playCount: 0,
      genre: "Other",
      isApp: false,
    },
  ],
  fetchedAt: "2022-06-01T00:00:00.000Z",
  meta: {
    totalGames: 4,
    totalHours: 200,
    totalSessions: 40,
    appsExcluded: [],
    span: {},
  },
  isDemo: false,
};

describe(".headlineTotals", () => {
  it("derives days and years from the lifetime hours total", () => {
    const data: DashboardData = {
      ...sample,
      meta: { ...sample.meta, totalHours: 8760, totalGames: 2, totalSessions: 10 },
    };

    expect(headlineTotals(data)).toEqual({
      totalHours: 8760,
      days: 365,
      years: 1,
      gamesPlayed: 2,
      sessions: 10,
      biggestGame: data.games[0],
      trophyLevel: 5,
    });
  });

  it("passes the demo meta through unchanged", () => {
    const totals = headlineTotals(demoDashboard);

    expect(totals.totalHours).toBe(7687.75);
    expect(totals.gamesPlayed).toBe(98);
    expect(totals.sessions).toBe(5966);
    expect(totals.trophyLevel).toBe(220);
    expect(totals.biggestGame).toBe(demoDashboard.games[0]);
  });
});

describe(".topGamesByHours", () => {
  it("returns the n biggest games, hours-sorted and rounded", () => {
    expect(topGamesByHours(sample, 2)).toEqual([
      { name: "A", hours: 100, platform: "PS5" },
      { name: "B", hours: 50, platform: "PS4" },
    ]);
  });

  it("leads the demo library with the most-played title", () => {
    expect(topGamesByHours(demoDashboard, 1)).toEqual([
      { name: "Call of Duty®: Modern Warfare®", hours: 1254, platform: "PS4" },
    ]);
  });
});

describe(".genreBreakdown", () => {
  it("groups hours into genre buckets with share percentages, biggest first", () => {
    expect(genreBreakdown(sample)).toEqual([
      { genre: "Shooter", hours: 150, games: 2, share: 75 },
      { genre: "RPG", hours: 50, games: 1, share: 25 },
      { genre: "Other", hours: 0, games: 1, share: 0 },
    ]);
  });
});

describe(".topFranchises", () => {
  it("totals hours per franchise and skips games without one", () => {
    expect(topFranchises(sample)).toEqual([
      { franchise: "Call of Duty", hours: 150, games: 2 },
      { franchise: "The Witcher", hours: 50, games: 1 },
    ]);
  });
});

describe(".hoursByYear", () => {
  it("buckets hours by most-recent-play year, oldest first", () => {
    expect(hoursByYear(sample)).toEqual([
      { year: 2019, hours: 50, games: 1 },
      { year: 2021, hours: 100, games: 1 },
      { year: 2022, hours: 50, games: 1 },
    ]);
  });
});

describe(".bingeVsDipIn", () => {
  it("derives average session length and drops never-played titles", () => {
    expect(bingeVsDipIn(sample)).toEqual([
      { name: "A", hours: 100, playCount: 10, hoursPerSession: 10 },
      { name: "B", hours: 50, playCount: 5, hoursPerSession: 10 },
      { name: "C", hours: 50, playCount: 25, hoursPerSession: 2 },
    ]);
  });
});

describe(".lifespans", () => {
  it("measures the first-to-last play span in days for dated titles", () => {
    expect(lifespans(sample)).toEqual([
      { name: "A", firstPlayed: "2020-01-01", lastPlayed: "2021-01-01", days: 366, hours: 100 },
      { name: "B", firstPlayed: "2019-01-01", lastPlayed: "2019-06-01", days: 151, hours: 50 },
      { name: "C", firstPlayed: "2022-01-01", lastPlayed: "2022-02-01", days: 31, hours: 50 },
    ]);
  });
});

describe(".recency", () => {
  it("splits the library into titles touched this year versus dormant ones", () => {
    expect(recency(sample)).toEqual({
      activeGames: 1,
      dormantGames: 3,
      activeHours: 50,
      dormantHours: 150,
      thisYear: 2022,
    });
  });
});

describe(".filterByTimeframe", () => {
  it("returns the same data unchanged for the all-time window", () => {
    expect(filterByTimeframe(sample, "all")).toBe(sample);
  });

  it("keeps only games last played within the last two years and recomputes meta totals", () => {
    const scoped = filterByTimeframe(sample, "last-2-years");

    expect(scoped.games.map((g) => g.titleId)).toEqual(["A", "C"]);
    expect(scoped.meta).toEqual({
      ...sample.meta,
      totalGames: 2,
      totalHours: 150,
      totalSessions: 35,
      firstEverPlayed: "2020-01-01",
      span: { from: "2020-01-01", to: "2022-02-01" },
    });
    expect(scoped.profile).toBe(sample.profile);
  });

  it("scopes to the current calendar year by last-played date", () => {
    expect(filterByTimeframe(sample, "this-year").games.map((g) => g.titleId)).toEqual(["C"]);
  });

  it("includes a game last played exactly on the window's lower bound", () => {
    const onBoundary: DashboardData = {
      ...sample,
      games: [
        {
          titleId: "X",
          name: "X",
          platform: "PS5",
          hours: 10,
          playCount: 1,
          genre: "Other",
          isApp: false,
          lastPlayed: "2022-01-01T00:00:00.000Z",
        },
      ],
    };

    expect(filterByTimeframe(onBoundary, "this-year").games.map((g) => g.titleId)).toEqual(["X"]);
  });

  it("yields an empty library with zeroed totals when no game falls in the window", () => {
    const future: DashboardData = { ...sample, fetchedAt: "2030-06-01T00:00:00.000Z" };

    const scoped = filterByTimeframe(future, "this-year");

    expect(scoped.games).toEqual([]);
    expect(scoped.meta).toEqual({
      ...sample.meta,
      totalGames: 0,
      totalHours: 0,
      totalSessions: 0,
      firstEverPlayed: undefined,
      span: { from: undefined, to: undefined },
    });
  });
});

describe(".valuePerGame", () => {
  it("averages hours and sessions across the library", () => {
    expect(valuePerGame(sample)).toEqual({
      avgHoursPerGame: 50,
      avgSessionsPerGame: 10,
      avgSessionLength: 5,
    });
  });
});
