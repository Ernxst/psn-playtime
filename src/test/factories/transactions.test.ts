import { describe, expect, it } from "vitest";
import * as Transactions from "./transactions";

const apiFactories = [
  ["multiProductPurchase", Transactions.multiProductPurchase],
  ["preOrderPurchase", Transactions.preOrderPurchase],
  ["subscriptionPurchase", Transactions.subscriptionPurchase],
  ["freeClaim", Transactions.freeClaim],
  ["nullNamePurchase", Transactions.nullNamePurchase],
  ["walletFunding", Transactions.walletFunding],
] as const;

describe.each(apiFactories)(".%s", (_name, factory) => {
  it("applies overrides", () => {
    expect(factory({ id: "override" }).id).toBe("override");
  });

  it("returns a fresh nested transaction for every call", () => {
    const override = Transactions.multiProductPurchase().purchaseDetails;
    const first = factory({ purchaseDetails: override });
    const second = factory({ purchaseDetails: override });

    expect(first).not.toBe(second);
    expect(first.purchaseDetails).not.toBe(override);
    expect(first.purchaseDetails).not.toBe(second.purchaseDetails);
    expect(first.purchaseDetails?.productPurchases).not.toBe(override?.productPurchases);
    expect(first.purchaseDetails?.productPurchases).not.toBe(
      second.purchaseDetails?.productPurchases
    );
    expect(first.purchaseDetails?.productPurchases[0]).not.toBe(
      second.purchaseDetails?.productPurchases[0]
    );
  });
});

describe(".row", () => {
  it("applies overrides to a fresh row", () => {
    const first = Transactions.row({ productName: "Override" });
    const second = Transactions.row();

    expect(first.productName).toBe("Override");
    expect(first).not.toBe(second);
  });
});

describe(".importRecord", () => {
  it("returns independent imports without modifying caller-owned rows", () => {
    const row = Transactions.row({ productName: "Caller-owned row" });
    const rows = [row];
    const input = { transactions: rows };
    const expected = structuredClone(input);
    const first = Transactions.importRecord(input);
    const second = Transactions.importRecord(input);

    expect(first).not.toBe(second);
    expect(first).not.toBe(input);
    expect(second).not.toBe(input);
    expect(first.transactions).not.toBe(second.transactions);
    expect(first.transactions).not.toBe(rows);
    expect(second.transactions).not.toBe(rows);
    expect(first.transactions[0]).not.toBe(second.transactions[0]);
    expect(first.transactions[0]).not.toBe(row);
    expect(second.transactions[0]).not.toBe(row);
    expect(first.transactions).toEqual(expected.transactions);
    expect(second.transactions).toEqual(expected.transactions);
    expect(input).toEqual(expected);
  });
});

describe(".aggregate", () => {
  it("returns independent transaction graphs without modifying caller input", () => {
    const transaction = Transactions.multiProductPurchase();
    const transactions = [transaction];
    const input = structuredClone(transactions);
    const first = Transactions.aggregate(transactions);
    const second = Transactions.aggregate(transactions);

    expect(first).not.toBe(transactions);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(transaction);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]?.purchaseDetails).not.toBe(transaction.purchaseDetails);
    expect(first[0]?.purchaseDetails).not.toBe(second[0]?.purchaseDetails);
    expect(first[0]?.purchaseDetails?.productPurchases).not.toBe(
      second[0]?.purchaseDetails?.productPurchases
    );
    expect(first[0]?.purchaseDetails?.productPurchases[0]).not.toBe(
      second[0]?.purchaseDetails?.productPurchases[0]
    );
    expect(transactions).toEqual(input);
  });
});

describe(".historyResponse", () => {
  it("returns independent response graphs without modifying caller input", () => {
    const transaction = Transactions.multiProductPurchase();
    const transactions = [transaction];
    const errors = [{ message: "partial result" }];
    const input = structuredClone({ transactions, errors });
    const options = { hasMore: true, nextEndDate: "2025-08-01", errors } as const;
    const first = Transactions.historyResponse(transactions, options);
    const second = Transactions.historyResponse(transactions, options);
    const firstHistory = first.data.transactionHistoryRetrieve;
    const secondHistory = second.data.transactionHistoryRetrieve;

    expect(first).not.toBe(second);
    expect(first.data).not.toBe(second.data);
    expect(firstHistory).not.toBe(secondHistory);
    expect(firstHistory.transactions).not.toBe(secondHistory.transactions);
    expect(firstHistory.transactions[0]).not.toBe(secondHistory.transactions[0]);
    expect(firstHistory.transactions[0]?.purchaseDetails).not.toBe(
      secondHistory.transactions[0]?.purchaseDetails
    );
    expect(firstHistory.transactions[0]?.purchaseDetails?.productPurchases).not.toBe(
      secondHistory.transactions[0]?.purchaseDetails?.productPurchases
    );
    expect(firstHistory.transactions[0]?.purchaseDetails?.productPurchases[0]).not.toBe(
      secondHistory.transactions[0]?.purchaseDetails?.productPurchases[0]
    );
    expect(firstHistory.hasMore).toBe(true);
    expect(firstHistory.nextEndDate).toBe("2025-08-01");
    expect(first.errors).toEqual(errors);
    expect(first.errors).not.toBe(errors);
    expect(first.errors).not.toBe(second.errors);
    expect(first.errors?.[0]).not.toBe(second.errors?.[0]);
    expect({ transactions, errors }).toEqual(input);
  });
});
