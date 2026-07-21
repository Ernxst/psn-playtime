import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "@/server/providers/account/psn/provider.effect";
import { authenticatePsnSession } from "@/server/providers/account/psn/session.effect";
import { PsnTransportLive } from "@/server/providers/account/psn/transport.effect";
import * as Psn from "@/test/factories/psn";
import { server } from "@/test/msw";
import { PSN_PLAYED_GAMES_URL, PSN_TROPHY_TITLES_URL, psnAuthUrl } from "@/test/msw-handlers";

const authenticate = (credential = "npsso-token") =>
  Effect.runPromise(
    authenticatePsnSession(Redacted.make(credential)).pipe(Effect.provide(PsnTransportLive))
  );

describe(".authenticatePsnSession", () => {
  it("authenticates once and pages played games and trophies over HTTP", async () => {
    const authorize = vi.fn(
      () =>
        new HttpResponse(null, {
          status: 302,
          headers: { Location: "https://example.test/redirect/?code=access-code" },
        })
    );
    const played = vi.fn(({ request }: { request: Request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      return HttpResponse.json(
        offset === 0
          ? Psn.playedPage(
              [
                Psn.playedTitle({ titleId: "first", name: "First" }),
                Psn.playedTitle({ titleId: "second", name: "Second" }),
              ],
              3
            )
          : Psn.playedPage([Psn.playedTitle({ titleId: "third", name: "Third" })], 3)
      );
    });
    const trophies = vi.fn(() =>
      HttpResponse.json(Psn.trophyPage([Psn.trophyTitle({ trophyTitleName: "First" })]))
    );
    server.use(
      http.get(psnAuthUrl("authorize"), authorize),
      http.get(PSN_PLAYED_GAMES_URL, played),
      http.get(PSN_TROPHY_TITLES_URL, trophies)
    );

    const session = await authenticate();
    const snapshot = await Effect.runPromise(buildSnapshot(session));

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(played).toHaveBeenCalledTimes(2);
    expect(snapshot.games.map((game) => game.titleId)).toStrictEqual(["first", "second", "third"]);
    expect(snapshot.games[0]?.trophy).toMatchObject({ progress: 0 });
  });

  it("rejects a credential before creating a session", async () => {
    server.use(http.get(psnAuthUrl("authorize"), () => new HttpResponse(null, { status: 200 })));

    await expect(authenticate("bad-token")).rejects.toMatchObject({
      _tag: "CredentialRejectedError",
    });
  });
});
