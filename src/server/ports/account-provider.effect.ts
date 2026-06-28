import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import type { DashboardData } from "@/lib/psn/types";
import type { AccountProviderError } from "./errors.effect";

/**
 * `AccountProvider` — the platform-agnostic seam (phase E3) between the
 * dashboard and a concrete account source (PSN today; the Xbox seam later).
 *
 * Shaped strictly by what the app needs TODAY: `signInWithTokenHandler` takes a
 * transient secret and produces one `DashboardData`. No PSN naming leaks across
 * this boundary — npsso tokens, psn-api endpoints, and the played-games ⇄
 * trophy name-matching all stay inside the E5 PSN implementation.
 */

/**
 * A transient account secret (PSN's npsso today). `Redacted` keeps it out of
 * logs/errors and reflects that it is used once and never stored server-side.
 */
export type AccountCredential = Redacted.Redacted<string>;

export interface AccountProviderShape {
  /**
   * Fetch and normalize one account into the `DashboardData` contract, given a
   * transient credential.
   *
   * This is the whole of `psn.ts`'s `authenticate` + `buildDashboard`: profile,
   * played games, and trophies, joined and partitioned into the contract. The
   * result is UN-enriched (keyword genres only, no `enriched` flag) — RAWG
   * genre/franchise/playtime is the separate, deferred {@link EnrichmentProvider}
   * concern, exactly as today's client-side merge keeps it.
   */
  readonly loadDashboard: (
    credential: AccountCredential
  ) => Effect.Effect<DashboardData, AccountProviderError>;
}

export class AccountProvider extends Context.Service<AccountProvider, AccountProviderShape>()(
  "psn-playtime/server/ports/account-provider.effect/AccountProvider"
) {}
