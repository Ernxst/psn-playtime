/**
 * Enrichment server-fn entry points. Wrap the RAWG genre/playtime and franchise
 * lookups in `createServerFn` handlers.
 *
 * `TitleEnrichment` is supplied by the process-lived `ServerLayer` (see
 * `runtime.effect.ts`), so these handlers no longer provide it per request —
 * the RAWG caches survive across requests. The effects just require
 * `TitleEnrichment` from the ambient runtime, satisfied by `runServer`.
 */
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { runServer } from "@/runtime/runtime.effect";
import { type Genre } from "@/server/providers/account/snapshot";
import { type TitleEnrichment } from "@/server/providers/enrichment/contract.effect";
import {
  prefetchFranchises,
  prefetchGameMetadata,
} from "@/server/providers/enrichment/rawg/provider.effect";

const RawgGenreInput = Schema.Struct({
  titles: Schema.Array(
    Schema.Struct({
      titleId: Schema.String,
      name: Schema.String,
      category: Schema.optional(Schema.String),
    })
  ),
});
const rawgGenreInput = Schema.toStandardSchemaV1(RawgGenreInput);

type RawgInputTitle = Schema.Schema.Type<typeof RawgGenreInput>["titles"][number];

/**
 * The unique title names a RAWG lookup should run for. RAWG is the sole
 * enrichment source and apps are already excluded from the snapshot's games, so
 * every game needs a lookup — just dedupe by name.
 */
function rawgLookupNames(titles: ReadonlyArray<{ name: string }>): string[] {
  return Array.from(new Set(titles.map((title) => title.name)));
}

/** Run the RAWG genre/playtime lookup against the ambient, process-lived provider. */
const rawgGenresEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<
  Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>,
  never,
  TitleEnrichment
> =>
  prefetchGameMetadata(rawgLookupNames(titles)).pipe(
    Effect.map((metadata) =>
      titles.flatMap((title) => {
        const info = metadata.get(title.name);
        const genre = info?.genre;
        const typicalPlaytime = info?.typicalPlaytime;
        if (genre === undefined && typicalPlaytime === undefined) return [];
        return [
          {
            titleId: title.titleId,
            ...(genre && { genre }),
            ...(typicalPlaytime !== undefined && { typicalPlaytime }),
          },
        ];
      })
    )
  );

/** Run the RAWG franchise lookup against the ambient, process-lived provider. */
const rawgFranchisesEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; franchise: string }>, never, TitleEnrichment> =>
  prefetchFranchises(rawgLookupNames(titles)).pipe(
    Effect.map((rawgFranchises) =>
      titles.flatMap((title) => {
        const franchise = rawgFranchises.get(title.name);
        return franchise !== undefined && franchise !== ""
          ? [{ titleId: title.titleId, franchise }]
          : [];
      })
    )
  );

/**
 * Run the genre lookup for a validated request. Mirrors
 * `signInWithTokenHandler`'s injectable-layer seam: production passes no
 * `enrichment`, so the effect runs against the process-lived `TitleEnrichment`
 * the ambient `runServer` runtime supplies (preserving the cross-request RAWG
 * caches); a test passes a fake `TitleEnrichment` layer to drive the lookup
 * deterministically. The result still degrades to blank enrichment on a provider
 * failure because `prefetchGameMetadata` already recovers the typed failures.
 */
export function getRawgGenresHandler(
  titles: readonly RawgInputTitle[],
  enrichment?: Layer.Layer<TitleEnrichment>
): Promise<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> {
  const effect = rawgGenresEffect(titles);
  // The handler is the server-fn entry point; a test injects a fake layer here.
  // @effect-diagnostics-next-line strictEffectProvide:off
  return runServer(enrichment === undefined ? effect : Effect.provide(effect, enrichment));
}

/** Franchise counterpart to {@link getRawgGenresHandler}, sharing the same seam. */
export function getRawgFranchisesHandler(
  titles: readonly RawgInputTitle[],
  enrichment?: Layer.Layer<TitleEnrichment>
): Promise<Array<{ titleId: string; franchise: string }>> {
  const effect = rawgFranchisesEffect(titles);
  // The handler is the server-fn entry point; a test injects a fake layer here.
  // @effect-diagnostics-next-line strictEffectProvide:off
  return runServer(enrichment === undefined ? effect : Effect.provide(effect, enrichment));
}

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => getRawgGenresHandler(data.titles));

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => getRawgFranchisesHandler(data.titles));
