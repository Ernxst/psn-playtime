/**
 * Enrichment server-fn entry points. Wrap the RAWG genre/playtime and franchise
 * lookups in `createServerFn` handlers.
 *
 * These handlers are application entry points, so each composes its own layer
 * and provides it here per request (the `strictEffectProvide` diagnostic — which
 * reserves Layer provides for entry points — is disabled per-line for exactly
 * these provides).
 */
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type Genre } from "@/lib/psn/contract.schema";
import { runServer } from "@/runtime/runtime.effect";
import {
  EnrichmentProviderLayer,
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

/** Run the RAWG genre/playtime lookup, providing the enrichment layer per request. */
const rawgGenresEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> =>
  prefetchGameMetadata(rawgLookupNames(titles)).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(EnrichmentProviderLayer),
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

/** Run the RAWG franchise lookup, providing the enrichment layer per request. */
const rawgFranchisesEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<Array<{ titleId: string; franchise: string }>> =>
  prefetchFranchises(rawgLookupNames(titles)).pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(EnrichmentProviderLayer),
    Effect.map((rawgFranchises) =>
      titles.flatMap((title) => {
        const franchise = rawgFranchises.get(title.name);
        return franchise !== undefined && franchise !== ""
          ? [{ titleId: title.titleId, franchise }]
          : [];
      })
    )
  );

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgGenresEffect(data.titles)));

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgFranchisesEffect(data.titles)));
