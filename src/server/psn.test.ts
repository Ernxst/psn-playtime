import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("psn-api", () => ({
  exchangeNpssoForAccessCode: vi.fn(),
  exchangeAccessCodeForAuthTokens: vi.fn(),
  getProfileFromUserName: vi.fn(),
  getUserPlayedGames: vi.fn(),
  getUserTitles: vi.fn(),
}));

import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type {
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  TrophyTitle,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";
import { signInWithTokenHandler } from "@/server/psn";

const mockExchangeNpsso = vi.mocked(exchangeNpssoForAccessCode);
const mockExchangeTokens = vi.mocked(exchangeAccessCodeForAuthTokens);
const mockGetProfile = vi.mocked(getProfileFromUserName);
const mockGetPlayed = vi.mocked(getUserPlayedGames);
const mockGetTitles = vi.mocked(getUserTitles);

type ProfileBody = ProfileFromUserNameResponse["profile"];
type PlayedTitle = UserPlayedGamesResponse["titles"][number];

const authTokens: AuthTokensResponse = {
  accessToken: "access-token",
  expiresIn: 3600,
  idToken: "id-token",
  refreshToken: "refresh-token",
  refreshTokenExpiresIn: 7200,
  scope: "psn:mobile.v2.core psn:clientapp",
  tokenType: "bearer",
};

const baseProfile: ProfileBody = {
  onlineId: "Ernxst_",
  accountId: "acc-1",
  npId: "np-1",
  avatarUrls: [{ size: "xl", avatarUrl: "https://img/xl" }],
  plus: 1,
  aboutMe: "Hello there",
  languagesUsed: ["en"],
  trophySummary: {
    level: 220,
    progress: 70,
    earnedTrophies: { bronze: 887, silver: 188, gold: 54, platinum: 9 },
  },
  isOfficiallyVerified: false,
  personalDetail: { firstName: "", lastName: "", profilePictureUrls: [] },
  personalDetailSharing: "no",
  personalDetailSharingRequestMessageFlag: false,
  primaryOnlineStatus: "offline",
  presences: [],
  friendRelation: "no-relation",
  requestMessageFlag: false,
  blocking: false,
  following: false,
  consoleAvailability: { availabilityStatus: "unavailable" },
};

function profile(overrides: Partial<ProfileBody> = {}): ProfileFromUserNameResponse {
  return { profile: { ...baseProfile, ...overrides } };
}

const basePlayed: PlayedTitle = {
  titleId: "",
  name: "",
  localizedName: "",
  imageUrl: "",
  localizedImageUrl: "",
  category: "ps4_game",
  service: "none",
  playCount: 0,
  concept: { id: 0, titleIds: [], name: "", media: { audios: [], videos: [], images: [] } },
  media: {},
  firstPlayedDateTime: "",
  lastPlayedDateTime: "",
  playDuration: "PT0S",
};

function played(overrides: Partial<PlayedTitle>): PlayedTitle {
  return { ...basePlayed, ...overrides };
}

const baseTrophy: TrophyTitle = {
  npServiceName: "trophy",
  npCommunicationId: "",
  trophySetVersion: "01.00",
  trophyTitleName: "",
  trophyTitleIconUrl: "",
  trophyTitlePlatform: "PS4",
  hasTrophyGroups: false,
  definedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  progress: 0,
  earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  hiddenFlag: false,
  lastUpdatedDateTime: "",
};

function trophy(overrides: Partial<TrophyTitle>): TrophyTitle {
  return { ...baseTrophy, ...overrides };
}

const playedTitles: PlayedTitle[] = [
  played({
    titleId: "cod",
    name: "Call of Duty®: Modern Warfare®",
    imageUrl: "https://img/cod",
    playDuration: "PT100H30M15S",
    playCount: 5,
    firstPlayedDateTime: "2020-01-01T10:00:00Z",
    lastPlayedDateTime: "2021-06-01T10:00:00Z",
  }),
  played({
    titleId: "d2",
    name: "Destiny 2",
    category: "ps5_native_game",
    imageUrl: "https://img/d2",
    playDuration: "PT10H",
    playCount: 2,
    firstPlayedDateTime: "2019-01-01T10:00:00Z",
    lastPlayedDateTime: "2019-06-01T10:00:00Z",
  }),
  withoutPlayCount(
    played({
      titleId: "unknown",
      name: "Totally Unknown Title",
      // Empty strings exercise the falsy duration/date guards (→ 0 hours, no date).
      imageUrl: "",
      playDuration: "",
      firstPlayedDateTime: "",
      lastPlayedDateTime: "not-a-real-date",
    })
  ),
  played({
    titleId: "weird",
    name: "Weird Game",
    // Non-matching duration string exercises the regex-miss path.
    playDuration: "GARBAGE",
    playCount: 1,
    firstPlayedDateTime: "2022-01-01T10:00:00Z",
    lastPlayedDateTime: "2022-02-01T10:00:00Z",
  }),
  played({
    titleId: "netflix",
    name: "Netflix",
    category: "ps4_native_media_app",
    playDuration: "PT3H",
    playCount: 9,
  }),
  played({
    titleId: "shorty",
    name: "Short Session Title",
    category: "ps5_native_game",
    // No hours component: exercises the minutes/seconds-only duration path.
    playDuration: "PT45M30S",
    playCount: 3,
    firstPlayedDateTime: "2023-01-01T10:00:00Z",
    lastPlayedDateTime: "2023-02-01T10:00:00Z",
  }),
  played({
    titleId: "spotify",
    name: "Spotify",
    category: "ps4_native_media_app",
    // Second excluded app so the apps-sort comparator runs.
    playDuration: "PT1H30M",
    playCount: 4,
  }),
];

const trophyTitles: TrophyTitle[] = [
  trophy({
    trophyTitleName: "Call of Duty Modern Warfare",
    progress: 40,
    earnedTrophies: { bronze: 3, silver: 2, gold: 1, platinum: 0 },
    lastUpdatedDateTime: "2021-05-01T00:00:00Z",
  }),
  trophy({
    trophyTitleName: "Call of Duty: Modern Warfare!",
    progress: 90,
    earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 1 },
    lastUpdatedDateTime: "2021-06-10T00:00:00Z",
  }),
  trophy({
    // Lower-progress collision: must be skipped in favour of the 90% entry.
    trophyTitleName: "Call of Duty - Modern Warfare",
    progress: 10,
    earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
    lastUpdatedDateTime: "2020-01-01T00:00:00Z",
  }),
  trophy({
    trophyTitleName: "Destiny 2",
    progress: 0,
    earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    lastUpdatedDateTime: "2019-01-01T00:00:00Z",
  }),
];

function playedPage(titles: PlayedTitle[], totalItemCount: number): UserPlayedGamesResponse {
  return { titles, totalItemCount, nextOffset: 0, previousOffset: 0 };
}

function trophyPage(trophies: TrophyTitle[], totalItemCount: number): UserTitlesResponse {
  return { trophyTitles: trophies, totalItemCount, nextOffset: 0, previousOffset: 0 };
}

/**
 * Drop the (type-required) `totalItemCount` so a page exercises the defensive
 * `?? all.length` pagination fallback — the PSN API can omit it in practice.
 */
function withoutTotal<T extends { totalItemCount: number }>(page: T): T {
  return { ...page, totalItemCount: undefined } as T;
}

/** Drop the (type-required) `playCount` to model a never-fully-launched title. */
function withoutPlayCount<T extends { playCount: number }>(title: T): T {
  return { ...title, playCount: undefined } as T;
}

/** Wire up a successful live build with the shared fixtures. */
function stubLiveBuild(profileResult: ProfileFromUserNameResponse = profile()): void {
  mockExchangeNpsso.mockResolvedValue("access-code");
  mockExchangeTokens.mockResolvedValue(authTokens);
  mockGetProfile.mockResolvedValue(profileResult);
  // Two pages: the first doesn't complete the set (loop continues), the second
  // is empty (loop breaks) — covering both pagination exit branches.
  mockGetPlayed
    .mockResolvedValueOnce(playedPage(playedTitles, 20))
    .mockResolvedValueOnce(playedPage([], 20));
  // Two non-empty pages: the first has a known total (loop continues), the
  // second an unknown total (breaks via the `?? all.length` fallback).
  mockGetTitles
    .mockResolvedValueOnce(trophyPage(trophyTitles.slice(0, 2), 100))
    .mockResolvedValueOnce(withoutTotal(trophyPage(trophyTitles.slice(2), 0)));
}

beforeEach(() => {
  delete process.env.RAWG_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
  mockGetTitles.mockReset();
  mockGetPlayed.mockReset();
});

describe(".signInWithTokenHandler", () => {
  it("normalizes a live PSN account for a valid token", async () => {
    stubLiveBuild();

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    expect(result.isDemo).toBe(false);
    expect(result.profile.onlineId).toBe("Ernxst_");
    expect(result.profile.avatarUrl).toBe("https://img/xl");
    expect(result.profile.isPlus).toBe(true);
    expect(result.profile.aboutMe).toBe("Hello there");
    expect(result.profile.totalTrophies).toBe(9 + 54 + 188 + 887);

    // Apps are excluded; games are sorted by hours desc.
    expect(result.games.map((g) => g.titleId)).toEqual(["cod", "d2", "shorty", "unknown", "weird"]);
    expect(result.meta.appsExcluded).toEqual([
      { name: "Netflix", hours: 3 },
      { name: "Spotify", hours: 1.5 },
    ]);
    // Minutes/seconds-only duration rounds to two decimals.
    expect(result.games[2]!.hours).toBe(0.76);

    const cod = result.games[0]!;
    expect(cod.hours).toBe(100.5);
    expect(cod.platform).toBe("PS4");
    expect(cod.imageUrl).toBe("https://img/cod");
    expect(cod.firstPlayed).toBe("2020-01-01");
    expect(cod.trophy).toEqual({
      progress: 90,
      earned: { platinum: 1, gold: 5, silver: 10, bronze: 20 },
      total: 36,
      hasPlatinum: true,
      lastEarnedAt: "2021-06-10T00:00:00Z",
    });

    // Matched trophy with zero earned → no lastEarnedAt, no platinum.
    expect(result.games[1]!.trophy).toMatchObject({
      total: 0,
      hasPlatinum: false,
      lastEarnedAt: undefined,
    });

    // Unmatched + unknown-name title keeps its keyword "Other" genre, no trophy.
    const unknown = result.games.find((g) => g.titleId === "unknown")!;
    expect(unknown.genre).toBe("Other");
    expect(unknown.trophy).toBeUndefined();
    expect(unknown.imageUrl).toBeUndefined();
    expect(unknown.hours).toBe(0);
    // Missing playCount is normalized to 0.
    expect(unknown.playCount).toBe(0);
    expect(unknown.firstPlayed).toBeUndefined();
    expect(unknown.lastPlayed).toBeUndefined();
  });

  it("matches a played title to its trophy list by canonical concept name", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "gow",
            // Store name carries an edition suffix the trophy set lacks, so it
            // only resolves via the canonical concept name.
            name: "God of War Ragnarök: Digital Deluxe Edition",
            category: "ps5_native_game",
            concept: { ...basePlayed.concept, name: "God of War Ragnarök" },
            playDuration: "PT220H",
            playCount: 7,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage(
        [
          trophy({
            trophyTitleName: "God of War Ragnarök",
            progress: 73,
            earnedTrophies: { bronze: 20, silver: 5, gold: 2, platinum: 1 },
            lastUpdatedDateTime: "2023-02-01T00:00:00Z",
          }),
        ],
        1
      )
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const gow = result.games.find((g) => g.titleId === "gow")!;

    expect(gow.trophy).toEqual({
      progress: 73,
      earned: { platinum: 1, gold: 2, silver: 5, bronze: 20 },
      total: 28,
      hasPlatinum: true,
      lastEarnedAt: "2023-02-01T00:00:00Z",
    });
  });

  it("matches a glyph-glued trophy name carrying a brand prefix to its played title", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "div2",
            name: "The Division 2",
            category: "ps4_game",
            concept: { ...basePlayed.concept, name: "The Division 2" },
            playDuration: "PT460H",
            playCount: 12,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage(
        [
          trophy({
            // Glyph glues "Division" to "2" and a "Tom Clancy's" brand prefix
            // sits only on the trophy side, so only a subset match resolves it.
            trophyTitleName: "Tom Clancy's The Division®2",
            progress: 64,
            earnedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 0 },
            lastUpdatedDateTime: "2024-01-01T00:00:00Z",
          }),
        ],
        1
      )
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toEqual({
      progress: 64,
      earned: { platinum: 0, gold: 3, silver: 8, bronze: 30 },
      total: 41,
      hasPlatinum: false,
      lastEarnedAt: "2024-01-01T00:00:00Z",
    });
  });

  it("does not subset-match an unrelated trophy list to a played title", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "div2",
            name: "The Division 2",
            category: "ps4_game",
            concept: { ...basePlayed.concept, name: "The Division 2" },
            playDuration: "PT460H",
            playCount: 12,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage([trophy({ trophyTitleName: "Forza Horizon 5", progress: 50 })], 1)
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toBeUndefined();
  });

  it.each([
    { playedName: "God of War", trophyTitleName: "God of War Ragnarök" },
    { playedName: "Persona 5", trophyTitleName: "Persona 5 Royal" },
    { playedName: "Grand Theft Auto V", trophyTitleName: "Grand Theft Auto V: The Story" },
    { playedName: "LEGO Star Wars", trophyTitleName: "LEGO Star Wars: The Skywalker Saga" },
    { playedName: "Call of Duty", trophyTitleName: "Call of Duty: Modern Warfare" },
  ])(
    'does not attach the more-specific "$trophyTitleName" to the broader played "$playedName"',
    async ({ playedName, trophyTitleName }) => {
      mockExchangeNpsso.mockResolvedValue("access-code");
      mockExchangeTokens.mockResolvedValue(authTokens);
      mockGetProfile.mockResolvedValue(profile());
      mockGetPlayed.mockResolvedValue(
        playedPage(
          [
            played({
              titleId: "seq",
              name: playedName,
              category: "ps5_native_game",
              concept: { ...basePlayed.concept, name: playedName },
              playDuration: "PT40H",
              playCount: 5,
            }),
          ],
          1
        )
      );
      mockGetTitles.mockResolvedValue(trophyPage([trophy({ trophyTitleName, progress: 60 })], 1));

      const result = await signInWithTokenHandler({ npsso: "npsso-token" });

      const game = result.games.find((g) => g.titleId === "seq")!;

      expect(game.trophy).toBeUndefined();
    }
  );

  it("matches a played title that carries a trailing platform suffix the trophy list omits", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "gta5",
            name: "Grand Theft Auto V (PlayStation®5)",
            category: "ps5_native_game",
            concept: { ...basePlayed.concept, name: "Grand Theft Auto V (PlayStation®5)" },
            playDuration: "PT300H",
            playCount: 20,
          }),
        ],
        1
      )
    );
    // Two stacks under one name: the more-progressed PS5 set is the representative.
    mockGetTitles.mockResolvedValue(
      trophyPage(
        [
          trophy({ trophyTitleName: "Grand Theft Auto V", progress: 27 }),
          trophy({
            trophyTitleName: "Grand Theft Auto V",
            progress: 28,
            earnedTrophies: { bronze: 40, silver: 8, gold: 2, platinum: 0 },
            lastUpdatedDateTime: "2024-03-01T00:00:00Z",
          }),
        ],
        2
      )
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const gta5 = result.games.find((g) => g.titleId === "gta5")!;

    expect(gta5.trophy).toEqual({
      progress: 28,
      earned: { platinum: 0, gold: 2, silver: 8, bronze: 40 },
      total: 50,
      hasPlatinum: false,
      lastEarnedAt: "2024-03-01T00:00:00Z",
    });
  });

  it("matches the glyph-glued The Division 2 when the brand prefix is on both sides", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "div2",
            name: "Tom Clancy's The Division 2",
            category: "ps4_game",
            concept: { ...basePlayed.concept, name: "Tom Clancy's The Division 2" },
            playDuration: "PT70H",
            playCount: 8,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage([trophy({ trophyTitleName: "Tom Clancy's The Division® 2", progress: 70 })], 1)
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toMatchObject({ progress: 70 });
  });

  it("keeps the most-progressed trophy list when a game has several under one name", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "minecraft",
            name: "Minecraft",
            category: "ps5_native_game",
            concept: { ...basePlayed.concept, name: "Minecraft" },
            playDuration: "PT120H",
            playCount: 15,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage(
        [
          trophy({ trophyTitleName: "Minecraft", progress: 22 }),
          trophy({ trophyTitleName: "Minecraft", progress: 34 }),
          // An additional set normalizes to a distinct key and must not clobber.
          trophy({ trophyTitleName: "Minecraft • Set 2", progress: 2 }),
        ],
        3
      )
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const minecraft = result.games.find((g) => g.titleId === "minecraft")!;

    expect(minecraft.trophy).toMatchObject({ progress: 34 });
  });

  it("leaves trophy undefined when no candidate name matches a trophy list", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "obscure",
            name: "Some Game With No Trophies",
            category: "ps5_native_game",
            concept: { ...basePlayed.concept, name: "Some Game With No Trophies" },
            playDuration: "PT5H",
            playCount: 1,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage([trophy({ trophyTitleName: "An Unrelated Game", progress: 50 })], 1)
    );

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    const obscure = result.games.find((g) => g.titleId === "obscure")!;

    expect(obscure.trophy).toBeUndefined();
  });

  it("falls back to an empty trophy map when the trophy fetch fails", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile({ avatarUrls: [], aboutMe: "" }));
    // Single page with no total: exercises the played-games `?? all.length` fallback.
    mockGetPlayed.mockResolvedValue(withoutTotal(playedPage(playedTitles, 0)));
    mockGetTitles.mockRejectedValue(new Error("trophy service down"));

    const result = await signInWithTokenHandler({ npsso: "npsso-token" });

    expect(result.isDemo).toBe(false);
    expect(result.profile.avatarUrl).toBeUndefined();
    expect(result.profile.aboutMe).toBeUndefined();
    expect(result.games.every((g) => g.trophy === undefined)).toBe(true);
  });

  it("falls back to the first listed avatar when no xl/l/m size is present", async () => {
    stubLiveBuild(profile({ avatarUrls: [{ size: "s", avatarUrl: "https://img/s" }], plus: 0 }));

    const result = await signInWithTokenHandler({ npsso: "fresh-token" });

    expect(result.isDemo).toBe(false);
    expect(result.profile.avatarUrl).toBe("https://img/s");
    expect(result.profile.isPlus).toBe(false);
  });

  it("throws a friendly error when authentication fails", async () => {
    mockExchangeNpsso.mockRejectedValue(new Error("nope"));

    await expect(signInWithTokenHandler({ npsso: "bad-token" })).rejects.toThrow(
      /That token didn't work/
    );
  });
});
