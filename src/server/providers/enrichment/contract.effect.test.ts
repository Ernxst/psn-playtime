import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";
import { RateLimitedError, UpstreamUnavailableError } from "../errors.effect";
import { type GameMetadata, TitleEnrichment } from "./contract.effect";

/**
 * Proves the `TitleEnrichment` port and its tagged errors compose: a trivial
 * in-memory layer implements the port, an Effect consumes it, and the tagged
 * failures are recovered on the typed channel.
 */

const ENRICHED: GameMetadata = { genre: "RPG", typicalPlaytime: 40 };

/**
 * A stand-in enrichment source: a known title resolves to a `GameMetadata`,
 * one title rate-limits, everything else is upstream-unavailable.
 */
const enrichmentTestLayer = Layer.succeed(TitleEnrichment, {
  metadataFor: (title: string) => {
    if (title === "Known Game") return Effect.succeed(ENRICHED);
    if (title === "Busy Game") return Effect.fail(new RateLimitedError({ provider: "rawg" }));
    return Effect.fail(
      new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" })
    );
  },
  franchiseFor: () => Effect.succeed(undefined),
});

describe("TitleEnrichment", () => {
  it("resolves a GameMetadata through the TitleEnrichment port", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* TitleEnrichment;
      return yield* provider.metadataFor("Known Game");
    });

    const info = await Effect.runPromise(program.pipe(Effect.provide(enrichmentTestLayer)));

    expect(info).toEqual(ENRICHED);
  });

  it("recovers both TitleEnrichment error tags on the typed channel", async () => {
    const lookup = (title: string) =>
      Effect.gen(function* () {
        const provider = yield* TitleEnrichment;
        return yield* provider.metadataFor(title);
      }).pipe(
        Effect.catchTags({
          RateLimitedError: (error) => Effect.succeed(`rate:${error.provider}`),
          UpstreamUnavailableError: (error) => Effect.succeed(`down:${error.reason}`),
        }),
        Effect.provide(enrichmentTestLayer)
      );

    await expect(Effect.runPromise(lookup("Busy Game"))).resolves.toBe("rate:rawg");
    await expect(Effect.runPromise(lookup("Other Game"))).resolves.toBe("down:upstream_error");
  });
});
