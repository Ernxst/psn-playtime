/**
 * Client-side persistence for imported PSN transactions.
 *
 * The dashboard playtime data comes from the server (npsso token POSTed per-fetch,
 * never stored, then discarded → react-query), but transactions are scraped in the
 * browser by the bookmarklet and handed off
 * via the URL fragment — they never touch the server. We persist them in
 * `localStorage` so the spend view survives reloads, and expose a
 * `useSyncExternalStore` hook so the dashboard re-renders when an import lands.
 */
import { useSyncExternalStore } from "react";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";

const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions";

/** Fired on the same tab after a write (the `storage` event only fires cross-tab). */
const TRANSACTIONS_EVENT = "psn-playtime:transactions-changed";

const importSchema = transactionImportSchema;

// Cache the parsed snapshot keyed on the raw string so `getSnapshot` returns a
// stable reference between renders (required by `useSyncExternalStore`).
let cachedRaw: string | null = null;
let cachedValue: TransactionImport | null = null;

function parse(raw: string): TransactionImport | null {
  try {
    const parsed = importSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Read the persisted import, or `null` when absent/corrupt/unavailable. */
export function loadTransactionImport(): TransactionImport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = raw === null ? null : parse(raw);
  return cachedValue;
}

/** Persist an import and notify same-tab subscribers. */
export function saveTransactionImport(value: TransactionImport): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(TRANSACTIONS_EVENT));
}

/** Remove the persisted import and notify same-tab subscribers. */
export function clearTransactionImport(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TRANSACTIONS_STORAGE_KEY);
  window.dispatchEvent(new Event(TRANSACTIONS_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TRANSACTIONS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(TRANSACTIONS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Subscribe to the persisted import. Returns `null` on the server and until the
 * first client read, so SSR and the initial client render agree.
 */
export function useTransactionImport(): TransactionImport | null {
  return useSyncExternalStore(subscribe, loadTransactionImport, () => null);
}
