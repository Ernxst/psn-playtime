import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import type { DashboardSourceError } from "../errors.effect";
import type { DashboardData } from "./snapshot";

/**
 * `DashboardSource` — the capability that loads one account's normalized
 * dashboard from a transient credential, independent of any concrete account
 * source.
 */

/**
 * A transient account secret. `Redacted` keeps it out of logs and errors; it is
 * used once to load a dashboard and never stored.
 */
export type AccountCredential = Redacted.Redacted<string>;

export interface DashboardSourceShape {
  /**
   * Load one account's dashboard from a credential. The result is un-enriched;
   * genre/franchise/playtime enrichment is the separate {@link TitleEnrichment}
   * capability.
   */
  readonly loadDashboard: (
    credential: AccountCredential
  ) => Effect.Effect<DashboardData, DashboardSourceError>;
}

export class DashboardSource extends Context.Service<DashboardSource, DashboardSourceShape>()(
  "psn-playtime/server/providers/account/contract.effect/DashboardSource"
) {}
