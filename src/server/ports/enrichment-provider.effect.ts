import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Genre } from "@/lib/psn/types";
import type { EnrichmentProviderError } from "./errors.effect";

/**
 * `EnrichmentProvider` — the platform-agnostic seam (phase E3) for the
 * genre/franchise/typical-playtime enrichment that `rawg.ts` provides today.
 *
 * Keeps RAWG specifics (endpoints, the API-key gate, query normalization) out
 * of the boundary; the E4 RAWG implementation supplies the layer. Lookups are
 * by title name, matching the current `lookupRawg*` functions.
 */

/**
 * Genre + typical hours-to-complete for one title. Both ride a single upstream
 * lookup today (`rawg.ts`'s `lookupRawgGameInfo`), so they are returned
 * together. Absent fields mean "no usable data" — the caller keeps its fallback.
 */
export interface GameEnrichment {
  readonly genre?: Genre;
  /** Community-average hours to complete; omitted when absent or zero. */
  readonly typicalPlaytime?: number;
}

export interface EnrichmentProviderShape {
  /**
   * Look up a title's coarse genre and typical playtime in one request.
   * Mirrors `rawg.ts`'s `lookupRawgGenre` + `lookupRawgPlaytime` (one cached
   * call). Missing data is a successful empty result, not an error.
   */
  readonly lookupGameInfo: (
    title: string
  ) => Effect.Effect<GameEnrichment, EnrichmentProviderError>;

  /**
   * Look up a title's franchise/series label. Mirrors `rawg.ts`'s
   * `lookupRawgFranchise`. `undefined` means "no franchise" (a successful
   * absence), not an error.
   */
  readonly lookupFranchise: (
    title: string
  ) => Effect.Effect<string | undefined, EnrichmentProviderError>;
}

export class EnrichmentProvider extends Context.Service<
  EnrichmentProvider,
  EnrichmentProviderShape
>()("psn-playtime/server/ports/enrichment-provider.effect/EnrichmentProvider") {}
