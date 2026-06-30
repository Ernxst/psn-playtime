import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { DashboardSource } from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import type { DashboardSourceError } from "@/server/providers/errors.effect";
import type { DashboardData } from "../snapshot";

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
  concept: {
    id: 0,
    titleIds: [],
    name: "",
    media: { audios: [], videos: [], images: [] },
  },
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

function playedPage(titles: PlayedTitle[], totalItemCount: number): UserPlayedGamesResponse {
  return { titles, totalItemCount, nextOffset: 0, previousOffset: 0 };
}

function trophyPage(trophies: TrophyTitle[], totalItemCount: number): UserTitlesResponse {
  return {
    trophyTitles: trophies,
    totalItemCount,
    nextOffset: 0,
    previousOffset: 0,
  };
}

/** Run `loadDashboard` through the real PSN layer, surfacing the success value. */
function loadDashboard(npsso = "npsso-token"): Promise<DashboardData> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make(npsso));
    }).pipe(Effect.provide(PsnDashboardSourceLayer))
  );
}

/** Run `loadDashboard`, recovering any port failure to its `_tag` for assertion. */
function loadDashboardTag(npsso = "npsso-token"): Promise<string> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make(npsso));
    }).pipe(
      Effect.match({
        onFailure: (error: DashboardSourceError) => error._tag,
        onSuccess: () => "ok",
      }),
      Effect.provide(PsnDashboardSourceLayer)
    )
  );
}

afterEach(() => {
  vi.clearAllMocks();
  mockGetPlayed.mockReset();
  mockGetTitles.mockReset();
});

describe(".loadDashboard", () => {
  it("normalises a live PSN account into an un-enriched snapshot", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "cod",
            name: "Call of Duty®: Modern Warfare®",
            imageUrl: "https://img/cod",
            playDuration: "PT100H30M15S",
            playCount: 5,
            firstPlayedDateTime: "2020-01-01T10:00:00Z",
          }),
          played({
            titleId: "netflix",
            name: "Netflix",
            category: "ps4_native_media_app",
          }),
        ],
        2
      )
    );
    mockGetTitles.mockResolvedValue(
      trophyPage(
        [
          trophy({
            trophyTitleName: "Call of Duty Modern Warfare",
            progress: 90,
            definedTrophies: { bronze: 40, silver: 10, gold: 5, platinum: 1 },
            earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 1 },
            lastUpdatedDateTime: "2021-06-10T00:00:00Z",
          }),
        ],
        1
      )
    );

    const result = await loadDashboard();

    expect(result.isDemo).toBe(false);
    expect(typeof result.fetchedAt).toBe("string");
    expect(result.profile.onlineId).toBe("Ernxst_");
    expect(result.profile.avatarUrl).toBe("https://img/xl");
    expect(result.games.map((g) => g.titleId)).toEqual(["cod"]);
    expect(result.meta.appsExcluded).toEqual([{ name: "Netflix", hours: 0 }]);

    const cod = result.games[0]!;
    expect(cod.hours).toBe(100.5);
    expect(cod.firstPlayed).toBe("2020-01-01");
    // RAWG is the sole enrichment source (merged client-side), so the snapshot
    // is un-enriched: a baseline "Other" genre and no franchise, even for a
    // well-known title that the old keyword table would have classified.
    expect(cod.genre).toBe("Other");
    expect(cod.franchise).toBeUndefined();
    expect(cod.trophy).toEqual({
      progress: 90,
      earned: { platinum: 1, gold: 5, silver: 10, bronze: 20 },
      total: 36,
      hasPlatinum: true,
      lastEarnedAt: "2021-06-10T00:00:00Z",
    });
  });

  it("derives each game's platform and excludes non-game apps", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          // Platform comes from the psn-api category.
          played({ titleId: "ps5", name: "A PS5 Game", category: "ps5_native_game" }),
          // No category token: platform falls back to the title name.
          played({ titleId: "named", name: "Some Game (PlayStation®4)", category: "unknown" }),
          // Neither category nor name carries a token: platform is OTHER.
          played({ titleId: "other", name: "Plain Title", category: "unknown" }),
          // Excluded by the psn-api media-app category.
          played({ titleId: "netflix", name: "Netflix", category: "ps4_native_media_app" }),
          // Excluded by name even though the category looks like a game.
          played({ titleId: "spotify", name: "Spotify", category: "ps4_game" }),
          // "Max" is a streaming app, but "Mad Max" is a game (word-boundary guard).
          played({ titleId: "madmax", name: "Mad Max", category: "ps4_game" }),
        ],
        6
      )
    );
    mockGetTitles.mockResolvedValue(trophyPage([], 0));

    const result = await loadDashboard();

    expect(result.games.map((g) => [g.titleId, g.platform])).toEqual([
      ["ps5", "PS5"],
      ["named", "PS4"],
      ["other", "OTHER"],
      ["madmax", "PS4"],
    ]);
    expect(result.meta.appsExcluded.map((a) => a.name)).toEqual(["Netflix", "Spotify"]);
  });

  it("fails with CredentialRejectedError when the npsso exchange is rejected", async () => {
    mockExchangeNpsso.mockRejectedValue(new Error("nope"));

    expect(await loadDashboardTag()).toBe("CredentialRejectedError");
  });

  it("fails with RateLimitedError when PSN signals HTTP 429", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockRejectedValue(new Error("429 Too Many Requests"));
    mockGetPlayed.mockResolvedValue(playedPage([], 0));
    mockGetTitles.mockResolvedValue(trophyPage([], 0));

    expect(await loadDashboardTag()).toBe("RateLimitedError");
  });

  it("fails with UpstreamUnavailableError on a non-429 fetch failure", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockRejectedValue(new Error("503 service unavailable"));
    mockGetPlayed.mockResolvedValue(playedPage([], 0));
    mockGetTitles.mockResolvedValue(trophyPage([], 0));

    expect(await loadDashboardTag()).toBe("UpstreamUnavailableError");
  });

  it("swallows a trophy-fetch failure to an empty trophy map", async () => {
    mockExchangeNpsso.mockResolvedValue("access-code");
    mockExchangeTokens.mockResolvedValue(authTokens);
    mockGetProfile.mockResolvedValue(profile());
    mockGetPlayed.mockResolvedValue(
      playedPage(
        [
          played({
            titleId: "cod",
            name: "Call of Duty",
            playDuration: "PT5H",
            playCount: 1,
          }),
        ],
        1
      )
    );
    mockGetTitles.mockRejectedValue(new Error("trophy service down"));

    const result = await loadDashboard();

    expect(result.isDemo).toBe(false);
    expect(result.games.every((g) => g.trophy === undefined)).toBe(true);
  });
});
