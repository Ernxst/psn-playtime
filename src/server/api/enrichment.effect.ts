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
  type EnrichmentPrefetch,
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

export type RawgEnrichmentOutcome = "complete" | "partial" | "unavailable" | "failed";

export interface RawgGenreItem {
  readonly titleId: string;
  readonly genre?: Genre;
  readonly typicalPlaytime?: number;
}

export interface RawgFranchiseItem {
  readonly titleId: string;
  readonly franchise: string;
}

export interface RawgGenreResult {
  readonly outcome: RawgEnrichmentOutcome;
  readonly items: RawgGenreItem[];
}

export interface RawgFranchiseResult {
  readonly outcome: RawgEnrichmentOutcome;
  readonly items: RawgFranchiseItem[];
}

/**
 * The unique title names a RAWG lookup should run for. RAWG is the sole
 * enrichment source and apps are already excluded from the snapshot's games, so
 * every game needs a lookup — just dedupe by name.
 */
function rawgLookupNames(titles: ReadonlyArray<{ name: string }>): string[] {
  return Array.from(new Set(titles.map((title) => title.name)));
}

/** Turn provider evidence into the persisted/UI outcome for one representation. */
function enrichmentOutcome<A>(
  prefetch: EnrichmentPrefetch<A>,
  resolvedTitles: number,
  totalTitles: number
): RawgEnrichmentOutcome {
  if (prefetch.availability === "unconfigured") return "unavailable";
  if (resolvedTitles === totalTitles) return "complete";
  if (prefetch.failures > 0 && prefetch.values.size === 0) return "failed";
  return "partial";
}

function genreItemsForTitle(
  title: RawgInputTitle,
  match:
    | { readonly metadata: { readonly genre?: Genre; readonly typicalPlaytime?: number } }
    | undefined
): RawgGenreItem[] {
  const genre = match?.metadata.genre;
  const typicalPlaytime = match?.metadata.typicalPlaytime;
  if (genre === undefined && typicalPlaytime === undefined) return [];
  return [
    {
      titleId: title.titleId,
      ...(genre === undefined ? {} : { genre }),
      ...(typicalPlaytime === undefined ? {} : { typicalPlaytime }),
    },
  ];
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
): Effect.Effect<RawgGenreResult, never, TitleEnrichment> =>
  prefetchGameMetadata(rawgLookupNames(titles)).pipe(
    Effect.map((prefetch) => {
      let resolvedTitles = 0;
      const items = titles.flatMap((title): RawgGenreItem[] => {
        const match = prefetch.values.get(title.name);
        if (match?.metadata.genre !== undefined) resolvedTitles += 1;
        return genreItemsForTitle(title, match);
      });
      return {
        outcome: enrichmentOutcome(prefetch, resolvedTitles, titles.length),
        items,
      };
    })
  );

/**
 * Run the RAWG franchise lookup against the ambient, process-lived provider.
 * Exported for the same fake-layer test seam as {@link rawgGenresEffect}; the
 * `TitleEnrichment` requirement stays on `R`, provided by `runServer` in prod.
 */
export const rawgFranchisesEffect = (
  titles: readonly RawgInputTitle[]
): Effect.Effect<RawgFranchiseResult, never, TitleEnrichment> =>
  prefetchFranchises(rawgLookupNames(titles)).pipe(
    Effect.map((prefetch) => {
      let resolvedTitles = 0;
      const items = titles.flatMap((title): RawgFranchiseItem[] => {
        const match = prefetch.values.get(title.name);
        if (match?.matched === true) resolvedTitles += 1;
        const franchise = match?.franchise;
        return franchise !== undefined && franchise !== ""
          ? [{ titleId: title.titleId, franchise }]
          : [];
      });
      return {
        outcome: enrichmentOutcome(prefetch, resolvedTitles, titles.length),
        items,
      };
    })
  );

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgGenresEffect(data.titles)));

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(({ data }) => runServer(rawgFranchisesEffect(data.titles)));
