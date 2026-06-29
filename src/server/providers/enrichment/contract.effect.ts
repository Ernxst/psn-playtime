import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Genre } from "../account/snapshot";
import type { EnrichmentProviderError } from "../errors.effect";

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
 * lookup today (`rawg.effect.ts`'s game search), so they are returned together.
 * Absent fields mean "no usable data" — the caller keeps its fallback.
 */
export interface GameMetadata {
  readonly genre?: Genre;
  /** Community-average hours to complete; omitted when absent or zero. */
  readonly typicalPlaytime?: number;
}

export interface EnrichmentProviderShape {
  /**
   * Fetch a title's coarse genre and typical playtime in one request. Both ride
   * a single cached RAWG game search. Missing data is a successful empty
   * result, not an error.
   */
  readonly fetchGameMetadata: (
    title: string
  ) => Effect.Effect<GameMetadata, EnrichmentProviderError>;

  /**
   * Fetch a title's franchise/series label. `undefined` means "no franchise" (a
   * successful absence), not an error.
   */
  readonly fetchFranchise: (
    title: string
  ) => Effect.Effect<string | undefined, EnrichmentProviderError>;
}

export class EnrichmentProvider extends Context.Service<
  EnrichmentProvider,
  EnrichmentProviderShape
>()("psn-playtime/server/providers/enrichment/contract.effect/EnrichmentProvider") {}
