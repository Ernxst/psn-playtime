import { describe, expect, it, onTestFinished, vi } from "vitest";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";
import {
  applyFilters,
  bingeVsDipIn,
  comebacks,
  defaultFilters,
  filterByTimeframe,
  gameRows,
  genreBreakdown,
  headlineTotals,
  hoursByYear,
  lifespans,
  recency,
  topFranchises,
  topGamesByHours,
  valuePerGame,
} from "./analytics";

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

describe(".comebacks", () => {
  it("ranks dated multi-session games by average gap between sessions", () => {
    expect(comebacks(sample)).toEqual([
      {
        name: "A",
        firstPlayed: "2020-01-01",
        lastPlayed: "2021-01-01",
        sessions: 10,
        avgGapDays: 40.7,
      },
      {
        name: "B",
        firstPlayed: "2019-01-01",
        lastPlayed: "2019-06-01",
        sessions: 5,
        avgGapDays: 37.8,
      },
      {
        name: "C",
        firstPlayed: "2022-01-01",
        lastPlayed: "2022-02-01",
        sessions: 25,
        avgGapDays: 1.3,
      },
    ]);
  });

  it("excludes single-session and undated titles", () => {
    const data: DashboardData = {
      ...sample,
      games: [
        { ...sample.games[0]!, titleId: "ONE", name: "One", playCount: 1 },
        {
          ...sample.games[1]!,
          titleId: "NO_DATES",
          name: "Undated",
          firstPlayed: undefined,
          lastPlayed: undefined,
        },
      ],
    };

    expect(comebacks(data)).toEqual([]);
  });

  it("excludes same-day spans that average a zero gap", () => {
    const data: DashboardData = {
      ...sample,
      games: [
        {
          ...sample.games[0]!,
          titleId: "SAME",
          name: "Same day",
          firstPlayed: "2021-03-01",
          lastPlayed: "2021-03-01",
          playCount: 8,
        },
      ],
    };

    expect(comebacks(data)).toEqual([]);
  });

  it("caps the ranking to the requested count", () => {
    expect(comebacks(sample, 1)).toEqual([
      {
        name: "A",
        firstPlayed: "2020-01-01",
        lastPlayed: "2021-01-01",
        sessions: 10,
        avgGapDays: 40.7,
      },
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

  it("scopes the this-year window to the actual current calendar year by last-played date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2022-06-01T00:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });

    expect(filterByTimeframe(sample, "this-year").games.map((g) => g.titleId)).toEqual(["C"]);
  });

  it("anchors the this-year window to real now, not data.fetchedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2021-12-31T00:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // fetchedAt's year (2022) would start the window at 2022-01-01 and keep only C.
    // Anchoring to "now" (2021) starts it at 2021-01-01, so A is kept too.
    expect(filterByTimeframe(sample, "this-year").games.map((g) => g.titleId)).toEqual(["A", "C"]);
  });

  it("includes a game last played exactly on the current year's 1 January lower bound", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2022-06-01T00:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });

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

  it("keeps the this-year calendar window tighter than the rolling last-12-months window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2022-06-01T00:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const lib: DashboardData = {
      ...sample,
      fetchedAt: "2022-06-01T00:00:00.000Z",
      games: [
        {
          titleId: "L",
          name: "L",
          platform: "PS5",
          hours: 10,
          playCount: 1,
          genre: "Other",
          isApp: false,
          lastPlayed: "2021-09-01T00:00:00.000Z",
        },
        {
          titleId: "Y",
          name: "Y",
          platform: "PS5",
          hours: 10,
          playCount: 1,
          genre: "Other",
          isApp: false,
          lastPlayed: "2022-03-01T00:00:00.000Z",
        },
      ],
    };

    // Last 12 months reaches back to 2021-06-01 (from fetchedAt), so it keeps both.
    expect(filterByTimeframe(lib, "last-12-months").games.map((g) => g.titleId)).toEqual([
      "L",
      "Y",
    ]);

    // This year starts at 2022-01-01, so the 2021 title drops.
    expect(filterByTimeframe(lib, "this-year").games.map((g) => g.titleId)).toEqual(["Y"]);
  });

  it("yields an empty library with zeroed totals when no game falls in the current year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-01T00:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const scoped = filterByTimeframe(sample, "this-year");

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

describe(".applyFilters", () => {
  const ids = (data: DashboardData) => data.games.map((g) => g.titleId);

  /** Library with trophy data for the trophy facets. */
  const trophied: DashboardData = {
    ...sample,
    games: [
      {
        titleId: "P",
        name: "Platinum hunter",
        platform: "PS5",
        hours: 40,
        playCount: 4,
        genre: "RPG",
        isApp: false,
        lastPlayed: "2022-03-01",
        trophy: {
          progress: 100,
          earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
          total: 10,
          hasPlatinum: true,
        },
      },
      {
        titleId: "Q",
        name: "Halfway",
        platform: "PS5",
        hours: 20,
        playCount: 2,
        genre: "RPG",
        isApp: false,
        lastPlayed: "2022-03-01",
        trophy: {
          progress: 50,
          earned: { platinum: 0, gold: 1, silver: 1, bronze: 1 },
          total: 10,
          hasPlatinum: false,
        },
      },
      {
        titleId: "R",
        name: "No trophies",
        platform: "PS4",
        hours: 10,
        playCount: 1,
        genre: "Other",
        isApp: false,
        lastPlayed: "2022-03-01",
      },
    ],
  };

  it("returns the same data unchanged when no facet is active", () => {
    expect(applyFilters(sample, defaultFilters)).toBe(sample);
  });

  it("keeps only games in the selected genres", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, genres: ["RPG"] }))).toEqual(["C"]);
  });

  it("keeps only games in the selected franchises, dropping ones without a franchise", () => {
    const scoped = applyFilters(sample, { ...defaultFilters, franchises: ["The Witcher"] });

    expect(ids(scoped)).toEqual(["C"]);
  });

  it("keeps only games on the selected platforms", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, platforms: ["PS4"] }))).toEqual([
      "B",
      "D",
    ]);
  });

  it("matches the name search as a case-insensitive substring", () => {
    const named: DashboardData = {
      ...sample,
      games: [
        { ...sample.games[0]!, titleId: "G", name: "God of War" },
        { ...sample.games[1]!, titleId: "H", name: "Gran Turismo" },
      ],
    };

    expect(ids(applyFilters(named, { ...defaultFilters, search: "war" }))).toEqual(["G"]);
  });

  it("keeps only games last played within the custom date range", () => {
    const scoped = applyFilters(sample, {
      ...defaultFilters,
      lastPlayedFrom: "2020-06-01",
      lastPlayedTo: "2021-12-31",
    });

    expect(ids(scoped)).toEqual(["A"]);
  });

  it("layers the custom from-date over the timeframe preset, keeping the later bound", () => {
    const scoped = applyFilters(sample, {
      ...defaultFilters,
      timeframe: "last-2-years",
      lastPlayedFrom: "2022-01-01",
    });

    expect(ids(scoped)).toEqual(["C"]);
  });

  it("keeps only games within the min/max hours range", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, minHours: 50, maxHours: 80 }))).toEqual([
      "B",
      "C",
    ]);
  });

  it("keeps only games with at least the minimum number of sessions", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, minSessions: 10 }))).toEqual(["A", "C"]);
  });

  it("keeps only games that have a platinum trophy", () => {
    expect(ids(applyFilters(trophied, { ...defaultFilters, hasPlatinum: true }))).toEqual(["P"]);
  });

  it("keeps only games whose trophy progress meets the minimum", () => {
    expect(ids(applyFilters(trophied, { ...defaultFilters, minTrophyProgress: 50 }))).toEqual([
      "P",
      "Q",
    ]);
  });

  it("keeps only games active in the data's most-recent year", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, activity: "active" }))).toEqual(["C"]);
  });

  it("keeps only games dormant since the data's most-recent year", () => {
    expect(ids(applyFilters(sample, { ...defaultFilters, activity: "dormant" }))).toEqual([
      "A",
      "B",
      "D",
    ]);
  });

  it("combines facets, keeping only games that satisfy every one", () => {
    const scoped = applyFilters(sample, {
      ...defaultFilters,
      genres: ["Shooter"],
      platforms: ["PS5"],
      minHours: 60,
    });

    expect(ids(scoped)).toEqual(["A"]);
  });

  it("yields an empty library with zeroed totals when nothing matches", () => {
    const scoped = applyFilters(sample, { ...defaultFilters, search: "no-such-game" });

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

  it("recomputes the meta totals and span for the surviving subset", () => {
    const scoped = applyFilters(sample, { ...defaultFilters, genres: ["Shooter"] });

    expect(scoped.meta).toEqual({
      ...sample.meta,
      totalGames: 2,
      totalHours: 150,
      totalSessions: 15,
      firstEverPlayed: "2019-01-01",
      span: { from: "2019-01-01", to: "2021-01-01" },
    });
    expect(scoped.profile).toBe(sample.profile);
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

  it("guards against divide-by-zero on an empty library", () => {
    const empty: DashboardData = {
      ...sample,
      games: [],
      meta: { ...sample.meta, totalGames: 0, totalHours: 0, totalSessions: 0 },
    };

    expect(valuePerGame(empty)).toEqual({
      avgHoursPerGame: 0,
      avgSessionsPerGame: 0,
      avgSessionLength: 0,
    });
  });
});

describe(".gameRows", () => {
  it("flattens each game into a render-ready row with trophy progress when present", () => {
    const withTrophy: DashboardData = {
      ...sample,
      games: [
        {
          ...sample.games[0]!,
          titleId: "T",
          name: "Trophied",
          trophy: {
            progress: 80,
            earned: { platinum: 0, gold: 1, silver: 2, bronze: 3 },
            total: 6,
            hasPlatinum: false,
          },
        },
        { ...sample.games[3]! },
      ],
    };

    expect(gameRows(withTrophy)).toEqual([
      {
        titleId: "T",
        name: "Trophied",
        platform: "PS5",
        hours: 100,
        playCount: 10,
        lastPlayed: "2021-01-01",
        trophyProgress: 80,
      },
      {
        titleId: "D",
        name: "D",
        platform: "PS4",
        hours: 0,
        playCount: 0,
        lastPlayed: undefined,
        trophyProgress: undefined,
      },
    ]);
  });

  it("surfaces trophy progress for tracked demo titles while leaving untracked ones blank", () => {
    const rows = gameRows(demoDashboard);

    const tracked = rows.filter((r) => r.trophyProgress !== undefined);
    const untracked = rows.filter((r) => r.trophyProgress === undefined);

    expect(tracked).toHaveLength(95);
    expect(untracked).toHaveLength(3);
  });
});

describe("analytics edge branches", () => {
  it("filterByTimeframe scopes to the last twelve months", () => {
    expect(filterByTimeframe(sample, "last-12-months").games.map((g) => g.titleId)).toEqual(["C"]);
  });

  it("genreBreakdown guards the share denominator when no hours are logged", () => {
    const zero: DashboardData = {
      ...sample,
      games: [{ ...sample.games[3]! }],
      meta: { ...sample.meta, totalHours: 0 },
    };

    expect(genreBreakdown(zero)).toEqual([{ genre: "Other", hours: 0, games: 1, share: 0 }]);
  });

  it("treats a game with an unparseable lastPlayed as having no year", () => {
    const broken: DashboardData = {
      ...sample,
      games: [{ ...sample.games[0]!, titleId: "BAD", lastPlayed: "not-a-date" }],
    };

    expect(hoursByYear(broken)).toEqual([]);
    expect(recency(broken).dormantGames).toBe(1);
  });

  it("ignores an unparseable custom from-date and keeps the whole library", () => {
    expect(applyFilters(sample, { ...defaultFilters, lastPlayedFrom: "nonsense" })).toBe(sample);
  });

  it("ignores an unparseable custom to-date and keeps the whole library", () => {
    expect(applyFilters(sample, { ...defaultFilters, lastPlayedTo: "nonsense" })).toBe(sample);
  });

  it("excludes games with an unparseable lastPlayed from a date-bounded filter", () => {
    const mixed: DashboardData = {
      ...sample,
      games: [
        { ...sample.games[0]!, titleId: "OK", lastPlayed: "2021-06-01" },
        { ...sample.games[1]!, titleId: "BAD", lastPlayed: "not-a-date" },
      ],
    };

    const scoped = applyFilters(mixed, {
      ...defaultFilters,
      lastPlayedFrom: "2020-01-01",
      lastPlayedTo: "2022-01-01",
    });

    expect(scoped.games.map((g) => g.titleId)).toEqual(["OK"]);
  });

  it("returns the original data when an active filter still matches every game", () => {
    expect(applyFilters(sample, { ...defaultFilters, minHours: 0 })).toBe(sample);
  });
});
