import * as Effect from "effect/Effect";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  PsnTransport,
  PsnTransportError,
  PsnTransportLive,
  type PsnTransportShape,
} from "@/server/providers/account/psn/transport.effect";
import { server } from "@/test/msw";
import {
  PSN_AUTH_URL,
  PSN_PLAYED_GAMES_URL,
  PSN_PROFILE_URL,
  PSN_TROPHY_TITLES_URL,
} from "@/test/msw-handlers";
import {
  psnPlayedPage,
  psnPlayedTitle,
  psnProfile,
  psnTokenResponse,
  psnTrophyPage,
  psnTrophyTitle,
} from "@/test/psn-fixtures";

const runTransport = <A>(
  operation: (transport: PsnTransportShape) => Effect.Effect<A, PsnTransportError>
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* operation(yield* PsnTransport);
    }).pipe(Effect.provide(PsnTransportLive))
  );

describe("PsnTransportLive", () => {
  it("binds every psn-api operation to the expected endpoint and arguments", async () => {
    const profile = psnProfile({ onlineId: "NetworkUser" });
    const played = psnPlayedPage([psnPlayedTitle({ titleId: "game-1", name: "Game One" })], 1);
    const trophies = psnTrophyPage([psnTrophyTitle({ trophyTitleName: "Game One" })], 1);
    server.use(
      http.get(`${PSN_AUTH_URL}/authorize`, ({ request }) => {
        const url = new URL(request.url);
        const valid =
          url.searchParams.get("response_type") === "code" &&
          request.headers.get("cookie") === "npsso=npsso-token";
        return new HttpResponse(null, {
          status: 302,
          headers: valid ? { Location: "https://example.test/redirect/?code=verified-code" } : {},
        });
      }),
      http.post(`${PSN_AUTH_URL}/token`, async ({ request }) => {
        const body = await request.text();
        return HttpResponse.json(body.includes("code=verified-code") ? psnTokenResponse : {});
      }),
      http.get(PSN_PROFILE_URL, ({ request }) =>
        HttpResponse.json(
          request.headers.get("authorization") === "Bearer access-token" ? profile : { profile: {} }
        )
      ),
      http.get(PSN_PLAYED_GAMES_URL, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json(
          request.headers.get("authorization") === "Bearer access-token" &&
            url.searchParams.get("limit") === "200" &&
            url.searchParams.get("offset") === "400"
            ? played
            : psnPlayedPage()
        );
      }),
      http.get(PSN_TROPHY_TITLES_URL, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json(
          request.headers.get("authorization") === "Bearer access-token" &&
            url.searchParams.get("limit") === "800" &&
            url.searchParams.get("offset") === "1600"
            ? trophies
            : psnTrophyPage()
        );
      })
    );

    const result = await runTransport((transport) =>
      Effect.gen(function* () {
        const code = yield* transport.exchangeNpssoForAccessCode("npsso-token");
        const auth = yield* transport.exchangeAccessCodeForAuthTokens(code);
        const profileResult = yield* transport.getProfile(auth);
        const playedResult = yield* transport.getPlayedGames(auth, { limit: 200, offset: 400 });
        const trophyResult = yield* transport.getUserTitles(auth, { limit: 800, offset: 1600 });
        return { code, auth, profileResult, playedResult, trophyResult };
      })
    );

    expect(result.code).toBe("verified-code");
    expect(result.auth.accessToken).toBe("access-token");
    expect(result.profileResult).toStrictEqual(profile);
    expect(result.playedResult).toStrictEqual(played);
    expect(result.trophyResult).toStrictEqual(trophies);
  });

  it("wraps a rejected psn-api request in PsnTransportError", async () => {
    server.use(http.get(PSN_PROFILE_URL, () => HttpResponse.error()));

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* PsnTransport;
        return yield* transport.getProfile({ accessToken: "access-token" }).pipe(Effect.flip);
      }).pipe(Effect.provide(PsnTransportLive))
    );

    expect(error).toBeInstanceOf(PsnTransportError);
    expect(error.cause).toBeInstanceOf(Error);
  });
});
