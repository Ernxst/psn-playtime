/**
 * Compatibility shim.
 *
 * The PSN `AccountProvider` implementation moved to `./psn/*` during the #165
 * hardening (a `PsnClient` service + pure normalization). This module re-exports
 * the provider layer so the legacy `psn.ts` server-fn handlers keep importing
 * `@/server/psn.effect` unchanged; they move to `handlers.effect.ts` in step 4,
 * after which this shim can be deleted.
 */
export { PsnAccountProviderLayer } from "@/server/psn/psn-account-provider.effect";
