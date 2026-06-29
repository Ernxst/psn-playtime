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
 * Single-tab only: unlike the previous hand-rolled store, there is no `storage`
 * event listener, so a write in another tab does not refresh this one.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";
import { kvsRuntime } from "@/runtime/kvs.effect";

const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions";

const decodeImport = Schema.decodeUnknownOption(transactionImportSchema);

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
  schema: Schema.NullOr(transactionImportSchema),
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
 * Subscribe to the persisted import. Returns `null` on the server and until the
 * runtime resolves the first `localStorage` read, so SSR and the initial client
 * render agree.
 */
export function useTransactionImport(): TransactionImport | null {
  return useAtomValue(transactionImportAtom);
}
