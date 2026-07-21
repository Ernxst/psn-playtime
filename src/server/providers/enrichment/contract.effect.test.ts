import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw";
import { rawgUrl } from "@/test/msw-handlers";
import { rawgGame, rawgSearch, rawgSeries } from "@/test/rawg-fixtures";
import { TitleEnrichment } from "./contract.effect";
import { TitleEnrichmentLayer } from "./rawg/provider.effect";

const RAWG = Layer.provide(
  TitleEnrichmentLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({ RAWG_API_KEY: "test-key" }))
);

const metadataFor = (title: string) =>
  Effect.gen(function* () {
    const enrichment = yield* TitleEnrichment;
    return yield* enrichment.metadataFor(title);
  }).pipe(Effect.provide(RAWG));

const franchiseFor = (title: string) =>
  Effect.gen(function* () {
    const enrichment = yield* TitleEnrichment;
    return yield* enrichment.franchiseFor(title);
  }).pipe(Effect.provide(RAWG));

describe("TitleEnrichment", () => {
  it("resolves metadata through the RAWG HTTP boundary", async () => {
    server.use(
      http.get(rawgUrl("games"), () =>
        HttpResponse.json(rawgSearch([rawgGame({ genres: ["RPG"], playtime: 40 })]))
      )
    );

    await expect(Effect.runPromise(metadataFor("Known Game"))).resolves.toStrictEqual({
      genre: "RPG",
      typicalPlaytime: 40,
    });
  });

  it("resolves an absent RAWG match as successful absence", async () => {
    server.use(http.get(rawgUrl("games"), () => HttpResponse.json(rawgSearch())));

    await expect(Effect.runPromise(metadataFor("Unknown Game"))).resolves.toStrictEqual({});
  });

  it("derives a franchise through the RAWG search and series boundaries", async () => {
    server.use(
      http.get(rawgUrl("games"), () =>
        HttpResponse.json(rawgSearch([rawgGame({ id: 42, name: "Forza Horizon 5" })]))
      ),
      http.get(rawgUrl("games/:id/game-series"), () =>
        HttpResponse.json(rawgSeries(["Forza Horizon 4", "Forza Motorsport 7"]))
      )
    );

    await expect(Effect.runPromise(franchiseFor("Forza Horizon 5"))).resolves.toBe("Forza");
  });

  it.each([
    { tag: "RateLimitedError", status: 429 },
    { tag: "UpstreamUnavailableError", status: 503 },
  ])("surfaces $tag from the RAWG HTTP boundary", async ({ tag, status }) => {
    server.use(http.get(rawgUrl("games"), () => new HttpResponse(null, { status })));

    const error = await Effect.runPromise(metadataFor("Busy Game").pipe(Effect.flip));

    expect(error._tag).toBe(tag);
    expect(error.provider).toBe("rawg");
  });
});
