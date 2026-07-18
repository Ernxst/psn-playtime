import { useAtomValue } from "@effect/atom-react";
/**
 * Client-side persistence for imported PSN transactions.
 *
 * Transactions are scraped in the browser by the bookmarklet and handed off
 * through the URL fragment — they never touch the server. Each import is keyed
 * by its owning PSN account id before it can be read by a dashboard.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type TransactionImport, transactionImportSchema } from "@/domain/transactions";
import { kvsRuntime } from "@/runtime/kvs.effect";

const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions";

/** Every persisted transaction import, keyed by its owning PSN account id. */
const transactionImportsAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: TRANSACTIONS_STORAGE_KEY,
  schema: Schema.Record(Schema.String, transactionImportSchema),
  defaultValue: (): Record<string, TransactionImport> => ({}),
  mode: "sync",
});

const decodeLegacyImport = Schema.decodeUnknownOption(transactionImportSchema);

/** Decode only the pre-account-keying storage shape, never a keyed record. */
function readLegacyImport(): TransactionImport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return Option.getOrNull(decodeLegacyImport(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/**
 * Migrate the old global import only under the sole-account migration policy.
 * With zero or multiple accounts the raw value stays untouched
 * and the keyed atom stays empty, so unknown data is never displayed. A later
 * explicit account import may replace that legacy value with the keyed record.
 */
function migrateLegacyImport(
  registry: AtomRegistry.AtomRegistry,
  accountIds: () => readonly string[]
): void {
  const legacy = readLegacyImport();
  if (legacy === null) return;
  const ids = accountIds();
  const accountId = ids[0];
  if (ids.length !== 1 || accountId === undefined) return;
  registry.set(transactionImportsAtom, { [accountId]: legacy });
}

/** Account-keyed read/write surface over persisted transaction imports. */
export interface TransactionStore {
  /** Claim a legacy global import when exactly one cached account can own it. */
  migrateLegacy(): void;
  /** Read one account's persisted import, or `null`. */
  load(accountId: string): TransactionImport | null;
  /** Persist one account's import; notifies hook subscribers. */
  save(accountId: string, value: TransactionImport): void;
  /** Clear one account's import while leaving every other account intact. */
  clear(accountId: string): void;
}

/** Build the transaction store over the same registry as the dashboard cache. */
export function makeTransactionStore(
  registry: AtomRegistry.AtomRegistry,
  accountIds: () => readonly string[]
): TransactionStore {
  const migrateLegacy = () => migrateLegacyImport(registry, accountIds);
  migrateLegacy();
  return {
    migrateLegacy,
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
