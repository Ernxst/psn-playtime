import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";
import type { TransactionImport, TransactionRow } from "@/domain/transactions";
import type { TransactionStore } from "@/stores/transactions-store";
import { buildTransactionsCsv } from "./csv";
import { importTransactionsCsv } from "./import-transactions";

/**
 * An in-memory {@link TransactionStore} for the import unit tests: the real store
 * only persists in a browser (`typeof window`), so these node tests drive the
 * import against a plain implementation of the same public interface.
 */
function memoryStore(initial: Record<string, TransactionImport> = {}): TransactionStore {
  let imports = initial;
  return {
    load: (accountId) => imports[accountId] ?? null,
    save: (accountId, next) => {
      imports = { ...imports, [accountId]: next };
    },
    clear: (accountId) => {
      const { [accountId]: _removed, ...rest } = imports;
      imports = rest;
    },
  };
}

/** A fully-keyed transaction row so round-trip comparisons stay `toStrictEqual`. */
function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    transactionId: "700000000000001",
    key: "line-1",
    date: "2025-08-29T13:31:23.987Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Hades",
    skuId: undefined,
    skuType: undefined,
    quantity: 1,
    amountMinor: 1599,
    currency: "£",
    displayAmount: "£15.99",
    originalPriceMinor: undefined,
    discountMinor: undefined,
    ...overrides,
  };
}

const transactions: TransactionRow[] = [
  row({
    key: "line-1",
    skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
    skuType: "STANDARD",
    originalPriceMinor: 1999,
    discountMinor: 400,
  }),
  row({
    transactionId: "700000000000002",
    key: "line-2",
    kind: "top-up",
    transactionType: "WALLET_FUNDING",
    productName: "WALLET_FUNDING",
    amountMinor: 5000,
    displayAmount: "£50.00",
  }),
];

describe(".importTransactionsCsv", () => {
  const accountId = "acc-1";

  it("reconstructs the exported transactions losslessly (round-trip)", async () => {
    const store = memoryStore();
    const csv = buildTransactionsCsv(transactions);

    const summary = await Effect.runPromise(importTransactionsCsv(store, accountId, csv));

    expect(summary).toStrictEqual({ parsed: 2, added: 2, total: 2 });
    expect(store.load(accountId)?.transactions).toStrictEqual(transactions);
  });

  it("tolerates reordered and extra columns, matching cells by header name", async () => {
    const store = memoryStore();
    const csv = [
      "note,key,amount_minor,transaction_id,date,transaction_type,kind,product_name,quantity,currency,display_amount,sku_id,sku_type,original_price_minor,discount_minor",
      "ignored,line-9,2500,700000000000009,2025-08-29,WALLET_FUNDING,top-up,WALLET_FUNDING,1,£,£25.00,,,,",
    ].join("\r\n");

    const summary = await Effect.runPromise(importTransactionsCsv(store, accountId, csv));

    expect(summary.added).toBe(1);
    expect(store.load(accountId)?.transactions[0]).toMatchObject({
      key: "line-9",
      amountMinor: 2500,
      transactionId: "700000000000009",
    });
  });

  it("merges into the existing import and de-dupes by row key (idempotent re-import)", async () => {
    const store = memoryStore({
      [accountId]: {
        transactions,
        importedAt: "2025-09-01T00:00:00.000Z",
        source: "store.playstation.com",
      },
    });
    const csv = buildTransactionsCsv(transactions);

    const summary = await Effect.runPromise(importTransactionsCsv(store, accountId, csv));

    expect(summary).toStrictEqual({ parsed: 2, added: 0, total: 2 });
    expect(store.load(accountId)?.transactions).toStrictEqual(transactions);
    expect(store.load(accountId)?.source).toBe("store.playstation.com");
  });

  it("appends only the genuinely new rows when merging a superset", async () => {
    const store = memoryStore({
      [accountId]: {
        transactions: [transactions[0]!],
        importedAt: "2025-09-01T00:00:00.000Z",
        source: "store.playstation.com",
      },
    });
    const csv = buildTransactionsCsv(transactions);

    const summary = await Effect.runPromise(importTransactionsCsv(store, accountId, csv));

    expect(summary).toStrictEqual({ parsed: 2, added: 1, total: 2 });
    expect(store.load(accountId)?.transactions).toStrictEqual(transactions);
  });

  it("fails with a schema error and leaves the store untouched for a malformed CSV", async () => {
    const store = memoryStore();
    const csv = [
      "transaction_id,key,date,transaction_type,kind,product_name,sku_id,sku_type,quantity,amount_minor,currency,display_amount,original_price_minor,discount_minor",
      "T1,line-1,2025-08-29,PRODUCT_PURCHASE,purchase,Hades,,,1,not-a-number,£,£15.99,,",
    ].join("\r\n");

    const exit = await Effect.runPromiseExit(importTransactionsCsv(store, accountId, csv));

    expect(exit).toSatisfy(Exit.isFailure);
    expect(store.load(accountId)).toBeNull();
  });

  it("does not merge an ownerless CSV into another account", async () => {
    const other = "acc-2";
    const store = memoryStore({
      [other]: {
        transactions: [transactions[0]!],
        importedAt: "2025-09-01T00:00:00.000Z",
        source: "store.playstation.com",
      },
    });

    await Effect.runPromise(
      importTransactionsCsv(store, accountId, buildTransactionsCsv(transactions))
    );

    expect(store.load(accountId)?.transactions).toStrictEqual(transactions);
    expect(store.load(other)?.transactions).toStrictEqual([transactions[0]!]);
  });
});
