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
 * Cross-tab sync is restored via {@link startCrossTabSync}: a `window` `storage`
 * listener, registered once per registry at client boot, pushes a write made in
 * another tab into this tab's registry so subscribers re-render. Registration is
 * idempotent per registry and returns a teardown, so the listener lifetime is
 * explicit rather than convention-only.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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
 * Maps each registry that already owns a `storage` listener to its teardown, so
 * a repeat call with the same registry returns the existing unsubscribe rather
 * than stacking a second listener over the same registry (a duplicate router
 * construction, HMR pass, or test setup would otherwise double-fire every
 * event). A `WeakMap` keeps the entry from pinning a registry past its own life.
 */
const crossTabTeardowns = new WeakMap<AtomRegistry.AtomRegistry, () => void>();

/**
 * Register the `storage` listener that keeps {@link useTransactionImport}
 * subscribers in sync with writes from other tabs, and return a teardown that
 * removes it. Wired at client boot (the CLIENT path of the router-context
 * factory) over the single app registry; a `typeof window` guard makes it a
 * no-op (returning a no-op teardown) on the server, where no `storage` events
 * exist.
 *
 * Idempotent per registry: a second call with the same registry adds no further
 * listener and returns the same teardown, so the lifetime is explicit rather
 * than convention-only — the listener is registered exactly once per registry
 * and a single teardown removes it.
 */
export function startCrossTabSync(registry: AtomRegistry.AtomRegistry): () => void {
  if (typeof window === "undefined") return () => {};
  const existing = crossTabTeardowns.get(registry);
  if (existing !== undefined) return existing;

  const handler = (event: StorageEvent) => syncFromStorageEvent(registry, event);
  window.addEventListener("storage", handler);
  const teardown = () => {
    window.removeEventListener("storage", handler);
    crossTabTeardowns.delete(registry);
  };
  crossTabTeardowns.set(registry, teardown);
  return teardown;
}

/**
 * Subscribe to the persisted import. Returns `null` on the server and until the
 * runtime resolves the first `localStorage` read, so SSR and the initial client
 * render agree.
 */
export function useTransactionImport(): TransactionImport | null {
  return useAtomValue(transactionImportAtom);
}
