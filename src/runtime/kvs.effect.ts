import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import * as Atom from "effect/unstable/reactivity/Atom";

/**
 * Atom runtime for browser-`localStorage`-backed atoms (`Atom.kvs`).
 *
 * `layerStorage` takes a thunk, so the `globalThis.localStorage` access is
 * deferred until an atom is actually read on the client — safe to construct
 * this layer at module scope even though `localStorage` is absent during SSR.
 */
export const kvsRuntime = Atom.runtime(KeyValueStore.layerStorage(() => globalThis.localStorage));
