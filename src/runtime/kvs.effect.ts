import * as Layer from "effect/Layer";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import * as Atom from "effect/unstable/reactivity/Atom";
import { AppConfig } from "./services.effect";

/**
 * Atom runtime for browser-`localStorage`-backed atoms (`Atom.kvs`).
 *
 * Kept separate from the shared `AppLayer` in `runtime.effect.ts` on purpose:
 * folding `KeyValueStore.layerStorage` into `AppLayer` would pull
 * `globalThis.localStorage` into the server composition root. `layerStorage`
 * takes a thunk, so the `globalThis.localStorage` access is deferred until an
 * atom is actually read on the client — safe to construct this layer at module
 * scope even though `localStorage` is absent during SSR.
 */
export const kvsRuntime = Atom.runtime(
  Layer.mergeAll(
    AppConfig.layer,
    KeyValueStore.layerStorage(() => globalThis.localStorage)
  )
);
