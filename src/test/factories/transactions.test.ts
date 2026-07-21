import { describe, expect, it } from "vitest";
import * as Transactions from "./transactions";

const apiFactories = [
  ["multi-product purchase", Transactions.multiProductPurchase],
  ["pre-order purchase", Transactions.preOrderPurchase],
  ["subscription purchase", Transactions.subscriptionPurchase],
  ["free claim", Transactions.freeClaim],
  ["null-name purchase", Transactions.nullNamePurchase],
  ["wallet funding", Transactions.walletFunding],
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

describe(".import", () => {
  it("clones caller-owned rows", () => {
    const row = Transactions.row();
    const rows = [row];
    const result = Transactions.import({ transactions: rows });

    expect(result.transactions).not.toBe(rows);
    expect(result.transactions[0]).not.toBe(row);
    expect(result.transactions[0]).toEqual(row);
  });
});

describe(".aggregate", () => {
  it("clones caller-owned transaction graphs", () => {
    const transaction = Transactions.multiProductPurchase();
    const transactions = [transaction];
    const result = Transactions.aggregate(transactions);

    expect(result).not.toBe(transactions);
    expect(result[0]).not.toBe(transaction);
    expect(result[0]?.purchaseDetails).not.toBe(transaction.purchaseDetails);
    expect(result[0]?.purchaseDetails?.productPurchases[0]).not.toBe(
      transaction.purchaseDetails?.productPurchases[0]
    );
  });
});

describe(".historyResponse", () => {
  it("clones transactions, pagination, and errors into a response", () => {
    const transaction = Transactions.multiProductPurchase();
    const errors = [{ message: "partial result" }];
    const result = Transactions.historyResponse([transaction], {
      hasMore: true,
      nextEndDate: "2025-08-01",
      errors,
    });
    const history = result.data.transactionHistoryRetrieve;

    expect(history.transactions[0]).not.toBe(transaction);
    expect(history.transactions[0]?.purchaseDetails).not.toBe(transaction.purchaseDetails);
    expect(history.hasMore).toBe(true);
    expect(history.nextEndDate).toBe("2025-08-01");
    expect(result.errors).toEqual(errors);
    expect(result.errors).not.toBe(errors);
    expect(result.errors?.[0]).not.toBe(errors[0]);
  });
});
