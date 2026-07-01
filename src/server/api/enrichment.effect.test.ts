import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it, vi } from "vitest";
import { rawgFranchisesEffect, rawgGenresEffect } from "@/server/api/enrichment.effect";
import { TitleEnrichment, type GameMetadata } from "@/server/providers/enrichment/contract.effect";
import {
  RateLimitedError,
  type TitleEnrichmentError,
  UpstreamUnavailableError,
} from "@/server/providers/errors.effect";

type RawgTitle = { titleId: string; name: string };

/**
 * A fake `TitleEnrichment` — the production seam both effects read through. The
 * returned spies let a test assert that a duplicated title name is looked up
 * once. Each capability defaults to a successful absence so a test only states
 * the lookup it cares about.
 */
function fakeEnrichment(
  cfg: {
    metadataFor?: (title: string) => Effect.Effect<GameMetadata, TitleEnrichmentError>;
    franchiseFor?: (title: string) => Effect.Effect<string | undefined, TitleEnrichmentError>;
  } = {}
) {
  const metadataFor = vi.fn(cfg.metadataFor ?? (() => Effect.succeed({})));
  const franchiseFor = vi.fn(cfg.franchiseFor ?? (() => Effect.succeed(undefined)));
  const layer = Layer.succeed(TitleEnrichment, { metadataFor, franchiseFor });
  return { layer, metadataFor, franchiseFor };
}

/**
 * Provide the fake `TitleEnrichment` layer onto the effect's `R` channel and run
 * it to a Promise — the test-side mirror of production's `runServer` (which
 * provides the real layer). The two-arg `Effect.provide` keeps the seam explicit.
 */
function runGenres(titles: RawgTitle[], layer: Layer.Layer<TitleEnrichment>) {
  return Effect.runPromise(Effect.provide(rawgGenresEffect(titles), layer));
}

function runFranchises(titles: RawgTitle[], layer: Layer.Layer<TitleEnrichment>) {
  return Effect.runPromise(Effect.provide(rawgFranchisesEffect(titles), layer));
}

const rateLimited: Effect.Effect<never, TitleEnrichmentError> = Effect.fail(
  new RateLimitedError({ provider: "rawg" })
);
const unavailable: Effect.Effect<never, TitleEnrichmentError> = Effect.fail(
  new UpstreamUnavailableError({ provider: "rawg", reason: "upstream_error" })
);

describe(".rawgGenresEffect", () => {
  it("returns the genre and typical playtime for titles RAWG matched", async () => {
    const matched: Record<string, GameMetadata> = {
      Halo: { genre: "Shooter", typicalPlaytime: 12 },
    };
    const { layer } = fakeEnrichment({
      metadataFor: (title) => Effect.succeed(matched[title] ?? {}),
    });

    const result = await runGenres(
      [
        { titleId: "halo", name: "Halo" },
        { titleId: "mystery", name: "Mystery Game" },
      ],
      layer
    );

    expect(result).toEqual([{ titleId: "halo", genre: "Shooter", typicalPlaytime: 12 }]);
  });

  it.each([
    { label: "a genre with no typical playtime", metadata: { genre: "RPG" } as GameMetadata },
    {
      label: "a typical playtime with no genre",
      metadata: { typicalPlaytime: 20 } as GameMetadata,
    },
    {
      label: "both a genre and a typical playtime",
      metadata: { genre: "RPG", typicalPlaytime: 20 } as GameMetadata,
    },
  ])("includes $label", async ({ metadata }) => {
    const { layer } = fakeEnrichment({ metadataFor: () => Effect.succeed(metadata) });

    const result = await runGenres([{ titleId: "t1", name: "Game" }], layer);

    expect(result).toEqual([{ titleId: "t1", ...metadata }]);
  });

  it("drops a title whose genre and typical playtime are both absent", async () => {
    const { layer } = fakeEnrichment({ metadataFor: () => Effect.succeed({}) });

    const result = await runGenres([{ titleId: "t1", name: "Unknown" }], layer);

    expect(result).toEqual([]);
  });

  it("looks a duplicated title name up once and applies it to every title that shares it", async () => {
    const { layer, metadataFor } = fakeEnrichment({
      metadataFor: () => Effect.succeed({ genre: "Racing" }),
    });

    const result = await runGenres(
      [
        { titleId: "gt-ps4", name: "Gran Turismo" },
        { titleId: "gt-ps5", name: "Gran Turismo" },
      ],
      layer
    );

    expect(metadataFor).toHaveBeenCalledExactlyOnceWith("Gran Turismo");
    expect(result).toEqual([
      { titleId: "gt-ps4", genre: "Racing" },
      { titleId: "gt-ps5", genre: "Racing" },
    ]);
  });

  it.each([
    { label: "rate-limits", failure: rateLimited },
    { label: "is unavailable", failure: unavailable },
  ])("degrades to blank enrichment when the provider $label", async ({ failure }) => {
    const { layer } = fakeEnrichment({ metadataFor: () => failure });

    const result = await runGenres([{ titleId: "t1", name: "Game" }], layer);

    expect(result).toEqual([]);
  });
});

describe(".rawgFranchisesEffect", () => {
  it("returns the franchise for titles RAWG matched", async () => {
    const matched: Record<string, string | undefined> = { Halo: "Halo" };
    const { layer } = fakeEnrichment({
      franchiseFor: (title) => Effect.succeed(matched[title]),
    });

    const result = await runFranchises(
      [
        { titleId: "halo", name: "Halo" },
        { titleId: "mystery", name: "Mystery Game" },
      ],
      layer
    );

    expect(result).toEqual([{ titleId: "halo", franchise: "Halo" }]);
  });

  it.each([
    { label: "no franchise", value: undefined },
    { label: "an empty-string franchise", value: "" },
  ])("drops a title with $label", async ({ value }) => {
    const { layer } = fakeEnrichment({ franchiseFor: () => Effect.succeed(value) });

    const result = await runFranchises([{ titleId: "t1", name: "Game" }], layer);

    expect(result).toEqual([]);
  });

  it("looks a duplicated title name up once and applies it to every title that shares it", async () => {
    const { layer, franchiseFor } = fakeEnrichment({
      franchiseFor: () => Effect.succeed("Gran Turismo"),
    });

    const result = await runFranchises(
      [
        { titleId: "gt-ps4", name: "Gran Turismo" },
        { titleId: "gt-ps5", name: "Gran Turismo" },
      ],
      layer
    );

    expect(franchiseFor).toHaveBeenCalledExactlyOnceWith("Gran Turismo");
    expect(result).toEqual([
      { titleId: "gt-ps4", franchise: "Gran Turismo" },
      { titleId: "gt-ps5", franchise: "Gran Turismo" },
    ]);
  });

  it.each([
    { label: "rate-limits", failure: rateLimited },
    { label: "is unavailable", failure: unavailable },
  ])("degrades to blank enrichment when the provider $label", async ({ failure }) => {
    const { layer } = fakeEnrichment({ franchiseFor: () => failure });

    const result = await runFranchises([{ titleId: "t1", name: "Game" }], layer);

    expect(result).toEqual([]);
  });
});
