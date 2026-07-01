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

/**
 * Run the RAWG genre/playtime lookup against the ambient, process-lived provider.
 *
 * The `TitleEnrichment` requirement stays on the effect's `R` channel: production
 * runs it through `runServer`, which provides the real `TitleEnrichmentLayer`
 * (and its cross-request caches); a test runs it by providing a fake
 * `TitleEnrichment` layer — same effect, different layer. Exported for that test
 * seam.
 */
export const rawgGenresEffect = (
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

/**
 * Run the RAWG franchise lookup against the ambient, process-lived provider.
 * Exported for the same fake-layer test seam as {@link rawgGenresEffect}; the
 * `TitleEnrichment` requirement stays on `R`, provided by `runServer` in prod.
 */
export const rawgFranchisesEffect = (
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

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgGenresEffect(data.titles)));

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgFranchisesEffect(data.titles)));
