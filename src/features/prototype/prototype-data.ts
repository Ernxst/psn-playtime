import type {
  DashboardData,
  DashboardMeta,
  GamePlay,
  ProfileSummary,
} from "@/server/providers/account/snapshot";

const atlasSlots = ["city", "stadium", "snow", "blocks", "desert", "coast"] as const;
const validatedRawgFixtures = new Set([
  "DEMO-1",
  "DEMO-2",
  "DEMO-3",
  "DEMO-4",
  "DEMO-5",
  "DEMO-6",
  "DEMO-7",
  "DEMO-8",
  "DEMO-9",
  "DEMO-10",
  "DEMO-11",
  "DEMO-12",
  "DEMO-13",
  "DEMO-14",
  "DEMO-15",
  "DEMO-16",
]);

export type PosterSlot = (typeof atlasSlots)[number];

export function posterSlot(game: Pick<GamePlay, "titleId">): PosterSlot | undefined {
  if (!validatedRawgFixtures.has(game.titleId)) return undefined;
  const value = Array.from(game.titleId).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0
  );
  return atlasSlots[value % atlasSlots.length];
}

const demoGameIndexes = [5, 6, 7, 8, 10, 11, 16, 20] as const;
const demoHours = [184, 142, 96, 81, 64, 51, 37, 22] as const;
const demoSessions = [73, 58, 44, 39, 31, 26, 19, 12] as const;
const demoTrophyProgress = [100, 82, 71, 64, 52, 43, 31, 18] as const;

function withPrototypeArtwork(games: readonly GamePlay[]): GamePlay[] {
  return games.map((game, index) => ({
    ...game,
    ...(index === 0 ? { imageUrl: "/playloom/psn-source.png" } : {}),
    ...(index % 4 === 0 ? { typicalPlaytime: Math.max(8, Math.round(game.hours / 4)) } : {}),
  }));
}

function demoProfile(profile: ProfileSummary): ProfileSummary {
  return {
    ...profile,
    onlineId: "PlayloomDemo",
    accountId: "demo",
    aboutMe: "A fictional player with deterministic games, sessions, trophies and purchases.",
    isPlus: false,
    trophyLevel: 128,
    levelProgress: 42,
    earned: { platinum: 2, gold: 18, silver: 64, bronze: 211 },
    totalTrophies: 295,
  };
}

function demoMeta(meta: DashboardMeta, games: readonly GamePlay[]): DashboardMeta {
  return {
    ...meta,
    totalGames: games.length,
    totalHours: games.reduce((total, game) => total + game.hours, 0),
    totalSessions: games.reduce((total, game) => total + game.playCount, 0),
    appsExcluded: [],
    firstEverPlayed: "2021-02-14",
    span: { from: "2021-02-14", to: "2026-05-14" },
  };
}

function demoFixture(data: DashboardData): DashboardData {
  const games = demoGameIndexes.map((gameIndex, index) => ({
    ...data.games[gameIndex]!,
    hours: demoHours[index]!,
    playCount: demoSessions[index]!,
    trophy: {
      progress: demoTrophyProgress[index]!,
      earned: {
        platinum: index < 2 ? 1 : 0,
        gold: 2 + index,
        silver: 4 + index,
        bronze: 9 + index,
      },
      total: 20 + index * 4,
      hasPlatinum: index < 2,
      lastEarnedAt: data.games[gameIndex]!.lastPlayed!,
    },
  }));
  return {
    ...data,
    profile: demoProfile(data.profile),
    games: withPrototypeArtwork(games),
    meta: demoMeta(data.meta, games),
  };
}

export function prototypeDashboard(data: DashboardData): DashboardData {
  return data.isDemo ? demoFixture(data) : { ...data, games: withPrototypeArtwork(data.games) };
}

export function safeSignedInDashboard(data: DashboardData): DashboardData {
  if (!data.isDemo) return prototypeDashboard(data);
  return {
    ...data,
    profile: {
      ...data.profile,
      onlineId: "MiraOnPSN",
      accountId: "preview-imported",
      aboutMe: "A sample PlayStation import for previewing account actions.",
      avatarUrl: "/playloom/sample-psn-avatar.svg",
      sourceLabel: "Imported from PlayStation",
      isPlus: true,
      trophyLevel: 220,
      levelProgress: 70,
      earned: { platinum: 9, gold: 54, silver: 188, bronze: 887 },
      totalTrophies: 1138,
    },
    games: withPrototypeArtwork(data.games),
    isDemo: false,
  };
}
