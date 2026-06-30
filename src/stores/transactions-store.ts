import { useAtomValue } from "@effect/atom-react";
/**
 * Client-side persistence for imported PSN transactions.
 *
 * The dashboard playtime data comes from the server (npsso token POSTed per-fetch,
 * never stored, then discarded → react-query), but transactions are scraped in the
 * browser by the bookmarklet and handed off via the URL fragment — they never
 * touch the server. We persist them in `localStorage` through an `@effect/atom`
 * `Atom.kvs`, and expose a `useTransactionImport` hook so the dashboard
 * re-renders when an import lands.
 *
 * Cross-tab sync is restored via {@link startCrossTabSync}: the `window`
 * `storage` listener is modelled as a scoped {@link crossTabSyncAtom} resource
 * (`Effect.acquireRelease`) mounted on the registry, so the registry's own scope
 * owns acquire/release and node identity makes registration idempotent — no
 * module-level bookkeeping. A write made in another tab is pushed into this tab's
 * registry so subscribers re-render.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";
import { kvsRuntime } from "@/runtime/kvs.effect";

const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions";

/**
 * The persisted shape: a valid import or `null` (absent/decoded-away key). Shared
 * by the kvs atom and the cross-tab bridge so both encode the same contract.
 */
const persistedSchema = Schema.NullOr(transactionImportSchema);

const decodeImport = Schema.decodeUnknownOption(transactionImportSchema);

/**
 * Structural equality over the persisted value, derived from the same schema.
 * The cross-tab bridge uses it to skip a no-op push (and the re-persist it would
 * trigger), so a `storage`-driven update cannot echo-cascade across tabs.
 */
const persistedEquivalence = Schema.toEquivalence(persistedSchema);

/**
 * `localStorage`-backed atom for the imported transactions. `NullOr` preserves
 * the `TransactionImport | null` contract: an absent/decoded-away key resolves
 * to `null`, a valid key to the decoded import.
 *
 * `mode: "sync"` (not "async") because `localStorage` is synchronous and we want
 * the atom's value to BE `TransactionImport | null`. Under `"async"` the writable
 * stores the raw value on a `set` while the read type stays `AsyncResult`, so a
 * post-write read no longer looks like a `Success` and reactivity breaks; sync
 * mode keeps reads and writes on the same plain `TransactionImport | null` type.
 */
const transactionImportAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: TRANSACTIONS_STORAGE_KEY,
  schema: persistedSchema,
  defaultValue: () => null,
  mode: "sync",
});

// Cache the parsed snapshot keyed on the raw string so repeated direct reads
// return a stable reference.
let cachedRaw: string | null = null;
let cachedValue: TransactionImport | null = null;

function parse(raw: string): TransactionImport | null {
  try {
    return Option.getOrNull(decodeImport(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/**
 * Read the persisted import directly from `localStorage`, or `null` when
 * absent/corrupt/unavailable. Kept as a synchronous read for the `/import`
 * route loader, which runs client-side before React renders.
 *
 * The kvs write runs on a forked fiber (Atom `runtime.fn`), so
 * `localStorage.setItem` flushes on a microtask rather than synchronously when
 * `store.save()` returns — an immediate read-after-write can be stale. That is
 * safe here only because the sole direct-read consumer, the `/import` loader,
 * reads before it writes within a single run, and re-runs are separated by
 * navigation (which lets the prior write flush).
 */
function readPersistedImport(): TransactionImport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = raw === null ? null : parse(raw);
  return cachedValue;
}

/**
 * Imperative read/write/clear surface over the persisted transaction import.
 * Built per request from the router-context registry and threaded to imperative
 * writers (the `/import` loader), so the raw {@link AtomRegistry} stays a
 * private implementation detail rather than a prop-drilled state container.
 */
export interface TransactionStore {
  /** Read the persisted import directly from `localStorage`, or `null`. */
  load(): TransactionImport | null;
  /** Persist an import; notifies {@link useTransactionImport} subscribers. */
  save(value: TransactionImport): void;
  /** Clear the persisted import so subsequent reads resolve to `null`. */
  clear(): void;
}

/**
 * Build a {@link TransactionStore} that closes over the per-request
 * {@link AtomRegistry}. The registry is the same instance the React hooks read
 * (seeded into `EffectAtomProvider` from the router context), so a `save`/`clear`
 * reaches the instance `useTransactionImport` subscribes to.
 *
 * `save`/`clear` write through the kvs atom, updating `localStorage` and
 * notifying subscribers; both keep the `typeof window` no-op guard so a server
 * render never touches `localStorage`. `load` needs no registry but lives here
 * for cohesion — the store is the single surface over the persisted import.
 */
export function makeTransactionStore(registry: AtomRegistry.AtomRegistry): TransactionStore {
  return {
    load: () => readPersistedImport(),
    save: (value) => {
      if (typeof window === "undefined") return;
      registry.set(transactionImportAtom, value);
    },
    clear: () => {
      if (typeof window === "undefined") return;
      registry.set(transactionImportAtom, null);
    },
  };
}

/**
 * Apply a cross-tab `storage` event to the registry. Fires only in tabs OTHER
 * than the writer, so it bridges another tab's write into this tab's atom.
 *
 * Ignores events for other keys. A removed key (`newValue === null`) maps to
 * `null`; a present key is decoded through the store's own {@link parse}
 * (decode-or-`null`, never throws on malformed input).
 *
 * Echo guard: the registry's cached value is stale here (a cross-tab write does
 * not invalidate the kvs node), so it still holds the pre-event value. If the
 * incoming value equals it, the push is skipped — otherwise `registry.set`
 * re-persists to `localStorage`, which can re-fire `storage` in further tabs.
 * Once every tab holds the new value its cached value matches the incoming one,
 * the guard skips, no re-persist happens, and the cascade terminates.
 */
function syncFromStorageEvent(registry: AtomRegistry.AtomRegistry, event: StorageEvent): void {
  if (event.key !== TRANSACTIONS_STORAGE_KEY) return;
  const next = event.newValue === null ? null : parse(event.newValue);
  if (persistedEquivalence(registry.get(transactionImportAtom), next)) return;
  registry.set(transactionImportAtom, next);
}

/**
 * Acquire side of the cross-tab resource: add the `storage` listener that
 * bridges another tab's write into `registry` and return its handle so the
 * release can remove exactly that listener.
 */
function addStorageListener(registry: AtomRegistry.AtomRegistry): (event: StorageEvent) => void {
  const handler = (event: StorageEvent) => syncFromStorageEvent(registry, event);
  window.addEventListener("storage", handler);
  return handler;
}

/** Release side of the cross-tab resource: remove the listener acquired above. */
const removeStorageListener = (handler: (event: StorageEvent) => void): Effect.Effect<void> =>
  Effect.sync(() => window.removeEventListener("storage", handler));

/**
 * Build the cross-tab `storage` listener as a scoped `Effect.acquireRelease`
 * resource bound to `registry`: acquire adds the listener, release removes it
 * when the surrounding scope closes. A `typeof window` guard makes it a no-op
 * during SSR (returning `Effect.void`), where no `storage` events exist and
 * `window` is absent, so SSR never touches `window`.
 */
function acquireCrossTabListener(
  registry: AtomRegistry.AtomRegistry
): Effect.Effect<void, never, Scope.Scope> {
  if (typeof window === "undefined") return Effect.void;
  return Effect.acquireRelease(
    Effect.sync(() => addStorageListener(registry)),
    removeStorageListener
  );
}

/**
 * The cross-tab listener modelled as an effect atom so the registry that mounts
 * it owns the lifetime: the `acquireRelease` release runs when the node's scope
 * closes (registry `dispose`, or the last mount handle unmounting past its idle
 * TTL). The bridge writes through `get.registry` — the very registry running
 * this atom, the same instance the React hooks read — so a cross-tab write
 * reaches the subscribers. Ownership is the `Scope`, not a returned function or
 * module-level map; idempotency falls out of the registry caching one node per
 * atom, so mounting twice acquires exactly one listener.
 */
const crossTabSyncAtom = Atom.make((get) => acquireCrossTabListener(get.registry));

/**
 * Mount {@link crossTabSyncAtom} on the registry so the `storage` listener that
 * keeps {@link useTransactionImport} subscribers in sync with other tabs is
 * acquired, and return the registry's unmount handle. Wired once at client boot,
 * over the browser's single app-lifetime registry (created in `getAtomRegistry`)
 * — so repeated router-context reconstructions reuse that registry rather than
 * stacking a fresh listener. The listener's removal is owned by that registry's
 * scope (`dispose`), not the returned handle.
 *
 * Idempotent per registry: the registry caches one node per atom, so a second
 * mount over the same registry reuses that node — `acquireRelease` acquire runs
 * once and exactly one listener is added. SSR is a no-op (the atom's `window`
 * guard skips acquire). Returns the unmount handle for explicit teardown/tests.
 */
export function startCrossTabSync(registry: AtomRegistry.AtomRegistry): () => void {
  return registry.mount(crossTabSyncAtom);
}

/**
 * Subscribe to the persisted import. Returns `null` on the server and until the
 * runtime resolves the first `localStorage` read, so SSR and the initial client
 * render agree.
 */
export function useTransactionImport(): TransactionImport | null {
  return useAtomValue(transactionImportAtom);
}
