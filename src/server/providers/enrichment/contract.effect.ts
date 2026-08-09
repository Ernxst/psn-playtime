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

/** Whether RAWG returned a game match for a title lookup. */
export interface GameMetadataMatch {
  readonly matched: boolean;
  readonly metadata: GameMetadata;
}

/** Whether RAWG matched a title, plus its series label when it belongs to one. */
export interface FranchiseMatch {
  readonly matched: boolean;
  readonly franchise?: string;
}

export type TitleEnrichmentAvailability = "available" | "unconfigured";

export interface TitleEnrichmentShape {
  /** Whether this deployment has the authority required to call RAWG. */
  readonly availability: TitleEnrichmentAvailability;

  /** Genre and typical playtime, preserving whether RAWG matched the title. */
  readonly metadataFor: (title: string) => Effect.Effect<GameMetadataMatch, TitleEnrichmentError>;

  /** The franchise/series label, preserving a matched title with no series. */
  readonly franchiseFor: (title: string) => Effect.Effect<FranchiseMatch, TitleEnrichmentError>;
}

export class TitleEnrichment extends Context.Service<TitleEnrichment, TitleEnrichmentShape>()(
  "psn-playtime/server/providers/enrichment/contract.effect/TitleEnrichment"
) {}
