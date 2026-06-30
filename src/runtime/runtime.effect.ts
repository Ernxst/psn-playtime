import type * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { EnrichmentProvider } from "@/server/providers/enrichment/contract.effect";
import { EnrichmentProviderLayer } from "@/server/providers/enrichment/rawg/provider.effect";

/**
 * Composition root for the server-side Effect runtime.
 *
 * A `ManagedRuntime` is reached through `runServer` for use inside
 * `createServerFn` handlers. Kept distinct from the client/atom wiring so
 * server-only layers can attach without leaking into the client bundle.
 *
 * `ServerLayer` folds in `EnrichmentProviderLayer` so the RAWG provider's
 * genre/franchise caches are built once per worker process and live for the
 * life of `serverRuntime`, giving cross-request cache hits for popular titles.
 * RAWG metadata is effectively static, so there are no stale-data concerns and
 * the unbounded-but-tiny per-title maps need no eviction. The per-request
 * `AccountProvider` stays out of here — it carries a transient credential and is
 * provided at its own handler boundary.
 */
const serverRuntime = ManagedRuntime.make(EnrichmentProviderLayer);

/**
 * Run an Effect inside a server handler, resolving a Promise for the success
 * value. Errors stay on the typed channel and surface as a rejected Promise.
 * `EnrichmentProvider` is satisfied by the process-lived `serverRuntime`, so
 * enrichment handlers no longer provide it per request.
 */
export const runServer = <A, E>(effect: Effect.Effect<A, E, EnrichmentProvider>): Promise<A> =>
  serverRuntime.runPromise(effect);
