import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { AppConfig } from "./services";

/**
 * Composition root for the Effect/atom migration (phase E1 foundation).
 *
 * Two `ManagedRuntime`s are built:
 * - `appRuntime` (exported) — the long-lived client/app runtime.
 * - a server runtime, reached through `runServer` for use inside
 *   `createServerFn` handlers (wired up in later phases). Kept distinct so
 *   server-only layers can attach without leaking into the client bundle.
 *
 * Both currently share the same minimal layer; later phases extend each side.
 */
export const AppLayer = Layer.mergeAll(AppConfig.layer);

const ServerLayer = Layer.mergeAll(AppConfig.layer);

export const appRuntime = ManagedRuntime.make(AppLayer);

const serverRuntime = ManagedRuntime.make(ServerLayer);

/**
 * Run an Effect inside a server handler, resolving a Promise for the success
 * value. Errors stay on the typed channel and surface as a rejected Promise.
 */
export const runServer = <A, E>(effect: Effect.Effect<A, E, AppConfig>): Promise<A> =>
  serverRuntime.runPromise(effect);
