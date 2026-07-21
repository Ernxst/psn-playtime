import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { DashboardSource } from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import { PsnTransportLive } from "@/server/providers/account/psn/transport.effect";
import * as Psn from "@/test/factories/psn";
import { server } from "@/test/msw";
import { PSN_PLAYED_GAMES_URL, PSN_PROFILE_URL, PSN_TROPHY_TITLES_URL } from "@/test/msw-handlers";

const layer = Layer.provide(PsnDashboardSourceLayer, PsnTransportLive);

const loadDashboard = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* DashboardSource;
      return yield* source.loadDashboard(Redacted.make("npsso-token"));
    }).pipe(Effect.provide(layer))
  );

describe(".loadDashboard", () => {
  it("normalises PSN HTTP responses and excludes media apps", async () => {
    server.use(
      http.get(PSN_PLAYED_GAMES_URL, () =>
        HttpResponse.json(
          Psn.playedPage([
            Psn.playedTitle({
              titleId: "cod",
              name: "Call of Duty®: Modern Warfare®",
              playDuration: "PT100H30M15S",
              playCount: 5,
            }),
            Psn.playedTitle({
              titleId: "netflix",
              name: "Netflix",
              category: "ps4_native_media_app",
            }),
          ])
        )
      ),
      http.get(PSN_TROPHY_TITLES_URL, () =>
        HttpResponse.json(
          Psn.trophyPage([
            Psn.trophyTitle({
              trophyTitleName: "Call of Duty Modern Warfare",
              progress: 90,
              earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 1 },
            }),
          ])
        )
      )
    );

    const result = await loadDashboard();

    expect(result.games.map((game) => game.titleId)).toStrictEqual(["cod"]);
    expect(result.games[0]).toMatchObject({ hours: 100.5, platform: "PS4" });
    expect(result.games[0]?.trophy).toMatchObject({ progress: 90, total: 36 });
    expect(result.meta.appsExcluded).toStrictEqual([{ name: "Netflix", hours: 0 }]);
  });

  it.each([
    ["429 Too Many Requests", "RateLimitedError"],
    ["503 service unavailable", "UpstreamUnavailableError"],
  ])("maps a profile failure containing %s to %s", async (message, tag) => {
    server.use(http.get(PSN_PROFILE_URL, () => HttpResponse.json({ error: { message } })));

    await expect(loadDashboard()).rejects.toMatchObject({ _tag: tag });
  });

  it("keeps playtime when the trophy endpoint is unavailable", async () => {
    server.use(
      http.get(PSN_PLAYED_GAMES_URL, () =>
        HttpResponse.json(
          Psn.playedPage([
            Psn.playedTitle({ titleId: "hzd", name: "Horizon", playDuration: "PT5H" }),
          ])
        )
      ),
      http.get(PSN_TROPHY_TITLES_URL, () => HttpResponse.error())
    );

    const result = await loadDashboard();

    expect(result.trophiesUnavailable).toBe(true);
    expect(result.games).toMatchObject([{ titleId: "hzd", hours: 5 }]);
  });
});
