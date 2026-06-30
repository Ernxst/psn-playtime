import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Genre } from "../account/snapshot";
import type { TitleEnrichmentError } from "../errors.effect";

/**
 * `TitleEnrichment` — the platform-agnostic capability (phase E3) that enriches
 * game titles with genre/franchise/typical-playtime, as `rawg.ts` provides today.
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

export interface TitleEnrichmentShape {
  /**
   * Coarse genre and typical playtime for a title, in one request. Both ride a
   * single cached RAWG game search. Missing data is a successful empty result,
   * not an error.
   */
  readonly metadataFor: (title: string) => Effect.Effect<GameMetadata, TitleEnrichmentError>;

  /**
   * The franchise/series label for a title. `undefined` means "no franchise" (a
   * successful absence), not an error.
   */
  readonly franchiseFor: (title: string) => Effect.Effect<string | undefined, TitleEnrichmentError>;
}

export class TitleEnrichment extends Context.Service<TitleEnrichment, TitleEnrichmentShape>()(
  "psn-playtime/server/providers/enrichment/contract.effect/TitleEnrichment"
) {}
