import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";
import { ProviderRateLimitedError, ProviderUnavailableError } from "../errors.effect";
import { type GameMetadata, EnrichmentProvider } from "./contract.effect";

/**
 * Proves the E3 EnrichmentProvider port tag and its tagged errors compose: a
 * trivial in-memory layer implements the port, an Effect consumes it, and the
 * tagged failures are recovered on the typed channel. Also keeps the port
 * referenced for knip.
 */

const ENRICHED: GameMetadata = { genre: "RPG", typicalPlaytime: 40 };

/**
 * A stand-in enrichment source: a known title resolves to a `GameMetadata`,
 * one title rate-limits, everything else is upstream-unavailable.
 */
const enrichmentTestLayer = Layer.succeed(EnrichmentProvider, {
  fetchGameMetadata: (title: string) => {
    if (title === "Known Game") return Effect.succeed(ENRICHED);
    if (title === "Busy Game")
      return Effect.fail(new ProviderRateLimitedError({ provider: "test" }));
    return Effect.fail(new ProviderUnavailableError({ provider: "test", reason: "503" }));
  },
  fetchFranchise: () => Effect.succeed(undefined),
});

describe("E3 service ports", () => {
  it("resolves a GameMetadata through the EnrichmentProvider port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* EnrichmentProvider;
      return yield* provider.fetchGameMetadata("Known Game");
    });

    const info = await Effect.runPromise(program.pipe(Effect.provide(enrichmentTestLayer)));

    expect(info).toEqual(ENRICHED);
  });

  it("recovers both EnrichmentProvider error tags on the typed channel", async () => {
    const lookup = (title: string) =>
      Effect.gen(function* () {
        const provider = yield* EnrichmentProvider;
        return yield* provider.fetchGameMetadata(title);
      }).pipe(
        Effect.catchTags({
          ProviderRateLimitedError: (error) => Effect.succeed(`rate:${error.provider}`),
          ProviderUnavailableError: (error) => Effect.succeed(`down:${error.reason}`),
        }),
        Effect.provide(enrichmentTestLayer)
      );

    expect(await Effect.runPromise(lookup("Busy Game"))).toBe("rate:test");
    expect(await Effect.runPromise(lookup("Other Game"))).toBe("down:503");
  });
});
