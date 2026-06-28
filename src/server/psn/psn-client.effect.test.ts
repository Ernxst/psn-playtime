/**
 * DI-seam test for the PSN provider.
 *
 * Proves that `buildSnapshot` depends on the `PsnClient` *service* — not the
 * concrete psn-api transport — by providing a hand-built fake `PsnClient` layer
 * (no psn-api, no mocks) and asserting the assembled `DashboardData` reflects
 * exactly what the fake session returned. This is the seam a future provider, or
 * a contract test, plugs into. It complements `psn-account-provider.effect.test`
 * (which drives the *real* client with mocked psn-api for byte-parity).
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { TrophyTitle, UserPlayedGamesResponse } from "psn-api";
import { describe, expect, it } from "vitest";
import type { DashboardData, ProfileSummary } from "@/lib/psn/types";
import { ProviderUnavailableError } from "@/server/ports/errors.effect";
import { buildSnapshot } from "@/server/psn/psn-account-provider.effect";
import { PsnClient, type PsnClientShape } from "@/server/psn/psn-client.effect";

type PlayedTitle = UserPlayedGamesResponse["titles"][number];

const profileSummary: ProfileSummary = {
  onlineId: "FakeUser",
  accountId: "acc-fake",
  aboutMe: undefined,
  avatarUrl: "https://img/fake",
  isPlus: true,
  trophyLevel: 100,
  levelProgress: 25,
  earned: { platinum: 2, gold: 10, silver: 20, bronze: 40 },
  totalTrophies: 72,
};

const basePlayed: PlayedTitle = {
  titleId: "",
  name: "",
  localizedName: "",
  imageUrl: "",
  localizedImageUrl: "",
  category: "ps5_game",
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

const played = (overrides: Partial<PlayedTitle>): PlayedTitle => ({
  ...basePlayed,
  ...overrides,
});

const baseTrophy: TrophyTitle = {
  npServiceName: "trophy",
  npCommunicationId: "",
  trophySetVersion: "01.00",
  trophyTitleName: "",
  trophyTitleIconUrl: "",
  trophyTitlePlatform: "PS5",
  hasTrophyGroups: false,
  definedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  progress: 0,
  earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  hiddenFlag: false,
  lastUpdatedDateTime: "",
};

const trophy = (overrides: Partial<TrophyTitle>): TrophyTitle => ({
  ...baseTrophy,
  ...overrides,
});

/** A fake `PsnClient` layer that serves canned session data — the DI seam. */
function fakePsnClient(shape: Partial<PsnClientShape>): Layer.Layer<PsnClient> {
  return Layer.succeed(PsnClient, {
    profile: shape.profile ?? Effect.succeed(profileSummary),
    playedGames: shape.playedGames ?? Effect.succeed([]),
    trophyTitles: shape.trophyTitles ?? Effect.succeed([]),
  });
}

/** Run `buildSnapshot` with an injected fake `PsnClient`. */
function snapshotWith(shape: Partial<PsnClientShape>): Promise<DashboardData> {
  return Effect.runPromise(buildSnapshot.pipe(Effect.provide(fakePsnClient(shape))));
}

describe("buildSnapshot DI seam", () => {
  it("assembles the snapshot from an injected fake PsnClient", async () => {
    const result = await snapshotWith({
      profile: Effect.succeed(profileSummary),
      playedGames: Effect.succeed([
        played({
          titleId: "hzd",
          name: "Horizon Forbidden West",
          imageUrl: "https://img/hzd",
          playDuration: "PT40H",
          playCount: 3,
          firstPlayedDateTime: "2022-02-18T12:00:00Z",
          lastPlayedDateTime: "2022-03-01T12:00:00Z",
        }),
      ]),
      trophyTitles: Effect.succeed([
        trophy({
          trophyTitleName: "Horizon Forbidden West",
          progress: 60,
          earnedTrophies: { bronze: 30, silver: 12, gold: 3, platinum: 0 },
          lastUpdatedDateTime: "2022-03-01T12:00:00Z",
        }),
      ]),
    });

    expect(result.isDemo).toBe(false);
    expect(result.profile).toBe(profileSummary);
    expect(result.games.map((g) => g.titleId)).toEqual(["hzd"]);
    const hzd = result.games[0]!;
    expect(hzd.hours).toBe(40);
    expect(hzd.firstPlayed).toBe("2022-02-18");
    expect(hzd.trophy).toEqual({
      progress: 60,
      earned: { platinum: 0, gold: 3, silver: 12, bronze: 30 },
      total: 45,
      hasPlatinum: false,
      lastEarnedAt: "2022-03-01T12:00:00Z",
    });
  });

  it("swallows an injected trophy-fetch failure to an empty trophy map", async () => {
    const result = await snapshotWith({
      playedGames: Effect.succeed([
        played({
          titleId: "hzd",
          name: "Horizon Forbidden West",
          playDuration: "PT5H",
        }),
      ]),
      trophyTitles: Effect.fail(new ProviderUnavailableError({ provider: "psn", reason: "down" })),
    });

    expect(result.games).toHaveLength(1);
    expect(result.games[0]!.trophy).toBeUndefined();
  });
});
