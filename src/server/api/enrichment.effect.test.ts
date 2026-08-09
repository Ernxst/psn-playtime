import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it, vi } from "vitest";
import { rawgFranchisesEffect, rawgGenresEffect } from "@/server/api/enrichment.effect";
import {
  type FranchiseMatch,
  type GameMetadataMatch,
  TitleEnrichment,
  type TitleEnrichmentAvailability,
} from "@/server/providers/enrichment/contract.effect";
import {
  RateLimitedError,
  type TitleEnrichmentError,
  UpstreamUnavailableError,
} from "@/server/providers/errors.effect";

type RawgTitle = { titleId: string; name: string };

function fakeEnrichment(
  cfg: {
    availability?: TitleEnrichmentAvailability;
    metadataFor?: (title: string) => Effect.Effect<GameMetadataMatch, TitleEnrichmentError>;
    franchiseFor?: (title: string) => Effect.Effect<FranchiseMatch, TitleEnrichmentError>;
  } = {}
) {
  const metadataFor = vi.fn(
    cfg.metadataFor ?? (() => Effect.succeed({ matched: false, metadata: {} }))
  );
  const franchiseFor = vi.fn(cfg.franchiseFor ?? (() => Effect.succeed({ matched: false })));
  const layer = Layer.succeed(TitleEnrichment, {
    availability: cfg.availability ?? "available",
    metadataFor,
    franchiseFor,
  });
  return { layer, metadataFor, franchiseFor };
}

function runGenres(titles: RawgTitle[], layer: Layer.Layer<TitleEnrichment>) {
  return Effect.runPromise(Effect.provide(rawgGenresEffect(titles), layer));
}

function runFranchises(titles: RawgTitle[], layer: Layer.Layer<TitleEnrichment>) {
  return Effect.runPromise(Effect.provide(rawgFranchisesEffect(titles), layer));
}

const unavailable: Effect.Effect<never, TitleEnrichmentError> = Effect.fail(
  new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" })
);
const rateLimited: Effect.Effect<never, TitleEnrichmentError> = Effect.fail(
  new RateLimitedError({ provider: "rawg" })
);

describe(".rawgGenresEffect", () => {
  it("returns complete metadata for every known RAWG match", async () => {
    const { layer } = fakeEnrichment({
      metadataFor: () =>
        Effect.succeed({ matched: true, metadata: { genre: "Shooter", typicalPlaytime: 12 } }),
    });

    await expect(runGenres([{ titleId: "halo", name: "Halo" }], layer)).resolves.toStrictEqual({
      outcome: "complete",
      items: [{ titleId: "halo", genre: "Shooter", typicalPlaytime: 12 }],
    });
  });

  it("keeps a genuine no-match partial rather than completing blank metadata", async () => {
    const { layer } = fakeEnrichment();

    await expect(
      runGenres([{ titleId: "unknown", name: "Unknown" }], layer)
    ).resolves.toStrictEqual({
      outcome: "partial",
      items: [],
    });
  });

  it("keeps available metadata when another title remains unresolved", async () => {
    const { layer } = fakeEnrichment({
      metadataFor: (title) =>
        Effect.succeed(
          title === "Halo"
            ? { matched: true, metadata: { genre: "Shooter" } }
            : { matched: false, metadata: {} }
        ),
    });

    await expect(
      runGenres(
        [
          { titleId: "halo", name: "Halo" },
          { titleId: "unknown", name: "Unknown" },
        ],
        layer
      )
    ).resolves.toStrictEqual({
      outcome: "partial",
      items: [{ titleId: "halo", genre: "Shooter" }],
    });
  });

  it.each([
    { label: "an upstream failure", failure: unavailable },
    { label: "a rate limit", failure: rateLimited },
  ])("returns failed metadata after $label", async ({ failure }) => {
    const { layer } = fakeEnrichment({ metadataFor: () => failure });

    await expect(runGenres([{ titleId: "game", name: "Game" }], layer)).resolves.toStrictEqual({
      outcome: "failed",
      items: [],
    });
  });

  it("returns unavailable without calling RAWG when no key is configured", async () => {
    const { layer, metadataFor } = fakeEnrichment({ availability: "unconfigured" });

    await expect(runGenres([{ titleId: "game", name: "Game" }], layer)).resolves.toStrictEqual({
      outcome: "unavailable",
      items: [],
    });
    expect(metadataFor).not.toHaveBeenCalled();
  });

  it("looks up a duplicated title once and applies its match to both source titles", async () => {
    const { layer, metadataFor } = fakeEnrichment({
      metadataFor: () => Effect.succeed({ matched: true, metadata: { genre: "Racing" } }),
    });

    await expect(
      runGenres(
        [
          { titleId: "gt-ps4", name: "Gran Turismo" },
          { titleId: "gt-ps5", name: "Gran Turismo" },
        ],
        layer
      )
    ).resolves.toStrictEqual({
      outcome: "complete",
      items: [
        { titleId: "gt-ps4", genre: "Racing" },
        { titleId: "gt-ps5", genre: "Racing" },
      ],
    });
    expect(metadataFor).toHaveBeenCalledExactlyOnceWith("Gran Turismo");
  });
});

describe(".rawgFranchisesEffect", () => {
  it("retains a matched title with no series as complete rather than a no-match", async () => {
    const { layer } = fakeEnrichment({
      franchiseFor: () => Effect.succeed({ matched: true }),
    });

    await expect(
      runFranchises([{ titleId: "stray", name: "Stray" }], layer)
    ).resolves.toStrictEqual({
      outcome: "complete",
      items: [],
    });
  });

  it("keeps a no-match partial and a failure failed", async () => {
    const noMatch = fakeEnrichment();
    const failed = fakeEnrichment({ franchiseFor: () => unavailable });

    await expect(
      runFranchises([{ titleId: "unknown", name: "Unknown" }], noMatch.layer)
    ).resolves.toStrictEqual({
      outcome: "partial",
      items: [],
    });
    await expect(
      runFranchises([{ titleId: "busy", name: "Busy" }], failed.layer)
    ).resolves.toStrictEqual({
      outcome: "failed",
      items: [],
    });
  });

  it("keeps available franchise metadata when another title remains unresolved", async () => {
    const { layer } = fakeEnrichment({
      franchiseFor: (title) =>
        Effect.succeed(
          title === "Halo" ? { matched: true, franchise: "Halo" } : { matched: false }
        ),
    });

    await expect(
      runFranchises(
        [
          { titleId: "halo", name: "Halo" },
          { titleId: "unknown", name: "Unknown" },
        ],
        layer
      )
    ).resolves.toStrictEqual({
      outcome: "partial",
      items: [{ titleId: "halo", franchise: "Halo" }],
    });
  });

  it("returns unavailable without calling RAWG when no key is configured", async () => {
    const { layer, franchiseFor } = fakeEnrichment({ availability: "unconfigured" });

    await expect(runFranchises([{ titleId: "game", name: "Game" }], layer)).resolves.toStrictEqual({
      outcome: "unavailable",
      items: [],
    });
    expect(franchiseFor).not.toHaveBeenCalled();
  });
});
