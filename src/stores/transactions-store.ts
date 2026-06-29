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
import { useAtomValue } from "@effect/atom-react";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";
import { kvsRuntime } from "@/runtime/kvs.effect";
import { getAppRegistry } from "@/runtime/provider.effect";

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
 * route loader, which runs client-side before React renders; the atom's writes
 * keep `localStorage` authoritative, so a direct read always sees them.
 */
export function loadTransactionImport(): TransactionImport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = raw === null ? null : parse(raw);
  return cachedValue;
}

/** Persist an import. The kvs write updates `localStorage` and notifies subscribers. */
export function saveTransactionImport(value: TransactionImport): void {
  if (typeof window === "undefined") return;
  getAppRegistry()?.set(transactionImportAtom, value);
}

/**
 * Clear the persisted import. Writes JSON `"null"` to the key (rather than
 * removing it); subsequent reads still resolve to `null`.
 */
export function clearTransactionImport(): void {
  if (typeof window === "undefined") return;
  getAppRegistry()?.set(transactionImportAtom, null);
}

/**
 * Subscribe to the persisted import. Returns `null` on the server and until the
 * runtime resolves the first `localStorage` read, so SSR and the initial client
 * render agree.
 */
export function useTransactionImport(): TransactionImport | null {
  return useAtomValue(transactionImportAtom);
}
