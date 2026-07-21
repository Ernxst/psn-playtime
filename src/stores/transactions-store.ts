import { useAtomValue } from "@effect/atom-react";
/**
 * Client-side persistence for imported PSN transactions.
 *
 * Transactions are scraped in the browser by the bookmarklet and handed off
 * through the URL fragment — they never touch the server. Each import is keyed
 * by its owning PSN account id before it can be read by a dashboard.
 */
import * as Schema from "effect/Schema";
import * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { demoTransactions } from "@/domain/demo-transactions";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";
import { kvsRuntime } from "@/runtime/kvs.effect";

const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions:accounts";
const DEMO_ACCOUNT_ID = "demo";
const demoTransactionImport: TransactionImport = {
  transactions: demoTransactions,
  importedAt: "2026-05-14T10:30:00.000Z",
  source: "playloom.demo",
};

/** Every persisted transaction import, keyed by its owning PSN account id. */
const transactionImportsAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: TRANSACTIONS_STORAGE_KEY,
  schema: Schema.Record(Schema.String, transactionImportSchema),
  defaultValue: (): Record<string, TransactionImport> => ({}),
  mode: "sync",
});

/** Account-keyed read/write surface over persisted transaction imports. */
export interface TransactionStore {
  /** Read one account's persisted import, or `null`. */
  load(accountId: string): TransactionImport | null;
  /** Persist one account's import; notifies hook subscribers. */
  save(accountId: string, value: TransactionImport): void;
  /** Clear one account's import while leaving every other account intact. */
  clear(accountId: string): void;
}

/** Build the transaction store over the same registry as the dashboard cache. */
export function makeTransactionStore(registry: AtomRegistry.AtomRegistry): TransactionStore {
  return {
    load: (accountId) => registry.get(transactionImportsAtom)[accountId] ?? null,
    save: (accountId, value) => {
      if (typeof window === "undefined") return;
      registry.set(transactionImportsAtom, {
        ...registry.get(transactionImportsAtom),
        [accountId]: value,
      });
    },
    clear: (accountId) => {
      if (typeof window === "undefined") return;
      const imports = registry.get(transactionImportsAtom);
      if (!(accountId in imports)) return;
      const { [accountId]: _removed, ...rest } = imports;
      registry.set(transactionImportsAtom, rest);
    },
  };
}

/** Subscribe to one account's persisted transaction import. */
export function useTransactionImport(accountId: string): TransactionImport | null {
  return useAtomValue(transactionImportsAtom)[accountId] ?? null;
}

/** Resolve the complete transaction dataset selected for a dashboard account. */
export function useDashboardTransactionImport(accountId: string): TransactionImport | null {
  const imported = useAtomValue(transactionImportsAtom)[accountId];
  if (imported) return imported;
  return accountId === DEMO_ACCOUNT_ID ? demoTransactionImport : null;
}
