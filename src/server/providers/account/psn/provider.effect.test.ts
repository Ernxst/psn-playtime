import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type {
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";
import { describe, expect, it } from "vitest";
import { DashboardSource } from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import {
  PsnTransport,
  PsnTransportError,
  type PsnTransportShape,
} from "@/server/providers/account/psn/transport.effect";
import type { DashboardSourceError } from "@/server/providers/errors.effect";
import {
  psnAuthTokens as authTokens,
  psnPlayedPage as playedPage,
  psnPlayedTitle as played,
  psnProfile as profile,
  psnTrophyPage as trophyPage,
  psnTrophyTitle as trophy,
} from "@/test/psn-fixtures";
import type { DashboardData } from "../snapshot";

/** A transport failure carrying `message` as its raw cause, as the live layer would. */
function psnFailure(message: string): Effect.Effect<never, PsnTransportError> {
  return Effect.fail(new PsnTransportError({ cause: new Error(message) }));
}

/**
 * A fake `PsnTransport` layer — the production seam the session reads through.
 * Each operation defaults to a benign success; a test overrides only the ones
 * its scenario exercises (e.g. a failing fetch or a specific page).
 */
function fakeTransport(
  overrides: {
    exchangeNpsso?: Effect.Effect<string, PsnTransportError>;
    exchangeTokens?: Effect.Effect<AuthTokensResponse, PsnTransportError>;
    profile?: Effect.Effect<ProfileFromUserNameResponse, PsnTransportError>;
    played?: Effect.Effect<UserPlayedGamesResponse, PsnTransportError>;
    titles?: Effect.Effect<UserTitlesResponse, PsnTransportError>;
  } = {}
): Layer.Layer<PsnTransport> {
  return Layer.succeed(PsnTransport, {
    exchangeNpssoForAccessCode: () => overrides.exchangeNpsso ?? Effect.succeed("access-code"),
    exchangeAccessCodeForAuthTokens: () => overrides.exchangeTokens ?? Effect.succeed(authTokens),
    getProfile: () => overrides.profile ?? Effect.succeed(profile()),
    getPlayedGames: () => overrides.played ?? Effect.succeed(playedPage([], 0)),
    getUserTitles: () => overrides.titles ?? Effect.succeed(trophyPage([], 0)),
  });
}

/** Run `loadDashboard` through the PSN layer over a fake transport, surfacing the success value. */
function loadDashboard(transport: Layer.Layer<PsnTransport>): Promise<DashboardData> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make("npsso-token"));
    }).pipe(Effect.provide(PsnDashboardSourceLayer), Effect.provide(transport))
  );
}

/** Run `loadDashboard`, recovering any port failure to its `_tag` for assertion. */
function loadDashboardTag(transport: Layer.Layer<PsnTransport>): Promise<string> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* DashboardSource;
      return yield* provider.loadDashboard(Redacted.make("npsso-token"));
    }).pipe(
      Effect.match({
        onFailure: (error: DashboardSourceError) => error._tag,
        onSuccess: () => "ok",
      }),
      Effect.provide(PsnDashboardSourceLayer),
      Effect.provide(transport)
    )
  );
}

/** Per-operation call counts a `countingTransport` records. */
interface TransportCalls {
  exchanges: number;
  fetches: number;
}

/**
 * A fake `PsnTransport` that records how often the credential is exchanged
 * (`exchanges`) and how often a snapshot fetch runs (`fetches`), so a test can
 * assert per-request authentication and that a rejected credential never fetches.
 */
function countingTransport(
  calls: TransportCalls,
  overrides: { exchangeNpsso?: Effect.Effect<string, PsnTransportError> } = {}
): Layer.Layer<PsnTransport> {
  const fetch = <A>(value: A): Effect.Effect<A, PsnTransportError> =>
    Effect.sync(() => {
      calls.fetches += 1;
      return value;
    });
  const shape: PsnTransportShape = {
    exchangeNpssoForAccessCode: () => {
      calls.exchanges += 1;
      return overrides.exchangeNpsso ?? Effect.succeed("access-code");
    },
    exchangeAccessCodeForAuthTokens: () => Effect.succeed(authTokens),
    getProfile: () => fetch(profile()),
    getPlayedGames: () => fetch(playedPage([], 0)),
    getUserTitles: () => fetch(trophyPage([], 0)),
  };
  return Layer.succeed(PsnTransport, shape);
}

describe(".loadDashboard", () => {
  it("authenticates the credential once per request, re-authenticating each call", async () => {
    const calls: TransportCalls = { exchanges: 0, fetches: 0 };
    const transport = countingTransport(calls);
    await loadDashboard(transport);
    expect(calls.exchanges).toBe(1);
    await loadDashboard(transport);
    expect(calls.exchanges).toBe(2);
  });

  it("normalises a live PSN account into an un-enriched snapshot", async () => {
    const result = await loadDashboard(
      fakeTransport({
        played: Effect.succeed(
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
        ),
        titles: Effect.succeed(
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
        ),
      })
    );

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
    // well-known title.
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
    const result = await loadDashboard(
      fakeTransport({
        played: Effect.succeed(
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
        ),
      })
    );

    expect(result.games.map((g) => [g.titleId, g.platform])).toEqual([
      ["ps5", "PS5"],
      ["named", "PS4"],
      ["other", "OTHER"],
      ["madmax", "PS4"],
    ]);
    expect(result.meta.appsExcluded.map((a) => a.name)).toEqual(["Netflix", "Spotify"]);
  });

  it("fails with CredentialRejectedError before any snapshot fetch runs when the npsso exchange is rejected", async () => {
    const calls: TransportCalls = { exchanges: 0, fetches: 0 };
    expect(
      await loadDashboardTag(countingTransport(calls, { exchangeNpsso: psnFailure("nope") }))
    ).toBe("CredentialRejectedError");
    expect(calls.fetches).toBe(0);
  });

  it("fails with RateLimitedError when PSN signals HTTP 429", async () => {
    expect(
      await loadDashboardTag(fakeTransport({ profile: psnFailure("429 Too Many Requests") }))
    ).toBe("RateLimitedError");
  });

  it("fails with UpstreamUnavailableError on a non-429 fetch failure", async () => {
    expect(
      await loadDashboardTag(fakeTransport({ profile: psnFailure("503 service unavailable") }))
    ).toBe("UpstreamUnavailableError");
  });

  it("flags trophies unavailable when the trophy fetch fails, keeping playtime and profile intact", async () => {
    const result = await loadDashboard(
      fakeTransport({
        played: Effect.succeed(
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
        ),
        titles: psnFailure("trophy service down"),
      })
    );

    expect(result.isDemo).toBe(false);
    expect(result.trophiesUnavailable).toBe(true);
    expect(result.profile.onlineId).toBe("Ernxst_");
    expect(result.games.map((g) => g.titleId)).toEqual(["cod"]);
    expect(result.games[0]!.hours).toBe(5);
    expect(result.games.every((g) => g.trophy === undefined)).toBe(true);
  });

  it("flags trophies unavailable when the trophy fetch is rate-limited", async () => {
    const result = await loadDashboard(
      fakeTransport({ titles: psnFailure("429 Too Many Requests") })
    );

    expect(result.trophiesUnavailable).toBe(true);
  });

  it("leaves trophies available when the trophy fetch succeeds but is empty", async () => {
    const result = await loadDashboard(
      fakeTransport({
        played: Effect.succeed(
          playedPage([played({ titleId: "cod", name: "Call of Duty", playCount: 1 })], 1)
        ),
        titles: Effect.succeed(trophyPage([], 0)),
      })
    );

    expect(result.trophiesUnavailable).toBe(false);
    expect(result.games.every((g) => g.trophy === undefined)).toBe(true);
  });
});
