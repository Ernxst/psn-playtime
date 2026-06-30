import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Genre } from "../account/snapshot";
import type { TitleEnrichmentError } from "../errors.effect";

/**
 * `TitleEnrichment` — the capability that enriches a game title, looked up by
 * name, with genre, franchise, and typical playtime. Missing data is a
 * successful absence, never a failure.
 */

/**
 * Genre and typical hours-to-complete for one title. An absent field means "no
 * usable data"; the caller keeps its own fallback.
 */
export interface GameMetadata {
  readonly genre?: Genre;
  /** Community-average hours to complete; omitted when absent or zero. */
  readonly typicalPlaytime?: number;
}

export interface TitleEnrichmentShape {
  /** Genre and typical playtime for a title; absence is a successful empty result. */
  readonly metadataFor: (title: string) => Effect.Effect<GameMetadata, TitleEnrichmentError>;

  /** The franchise/series label for a title, or `undefined` when it has none. */
  readonly franchiseFor: (title: string) => Effect.Effect<string | undefined, TitleEnrichmentError>;
}

export class TitleEnrichment extends Context.Service<TitleEnrichment, TitleEnrichmentShape>()(
  "psn-playtime/server/providers/enrichment/contract.effect/TitleEnrichment"
) {}
