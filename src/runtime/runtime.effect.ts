import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { DashboardSource } from "@/server/providers/account/contract.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import { PsnTransportLive } from "@/server/providers/account/psn/transport.effect";
import { TitleEnrichment } from "@/server/providers/enrichment/contract.effect";
import { TitleEnrichmentLayer } from "@/server/providers/enrichment/rawg/provider.effect";

/**
 * Composition root for the server-side Effect runtime.
 *
 * A `ManagedRuntime` is reached through `runServer` for use inside
 * `createServerFn` handlers. Kept distinct from the client/atom wiring so
 * server-only layers can attach without leaking into the client bundle.
 *
 * `ServerLayer` folds in `TitleEnrichmentLayer` so the RAWG provider's
 * genre/franchise caches are built once per worker process and live for the
 * life of `serverRuntime`, giving cross-request cache hits for popular titles.
 * RAWG metadata is effectively static, so there are no stale-data concerns and
 * the unbounded-but-tiny per-title maps need no eviction.
 *
 * It also folds in the account `DashboardSource`, bound to the live `psn-api`
 * transport (`PsnDashboardSourceLayer` fed `PsnTransportLive`), so the exported
 * `signInEffect` — which declares `DashboardSource` on its `R` channel — resolves
 * that requirement through `runServer` in production. The layer itself holds no
 * per-request state: the transient npsso credential is passed to
 * `loadDashboard(credential)` per call and never stored.
 */
const ServerLayer = Layer.merge(
  TitleEnrichmentLayer,
  Layer.provide(PsnDashboardSourceLayer, PsnTransportLive)
);

const serverRuntime = ManagedRuntime.make(ServerLayer);

/**
 * Run an Effect inside a server handler, resolving a Promise for the success
 * value. Errors stay on the typed channel and surface as a rejected Promise.
 * `TitleEnrichment` and the account `DashboardSource` are satisfied by the
 * process-lived `serverRuntime`, so handlers no longer provide them per request.
 */
export const runServer = <A, E>(
  effect: Effect.Effect<A, E, TitleEnrichment | DashboardSource>
): Promise<A> => serverRuntime.runPromise(effect);
