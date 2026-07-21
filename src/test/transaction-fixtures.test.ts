import { describe, expect, it } from "vitest";
import {
  freeClaimTransaction,
  multiProductPurchaseTransaction,
  nullNamePurchaseTransaction,
  preOrderPurchaseTransaction,
  subscriptionPurchaseTransaction,
  transactionAggregate,
  transactionHistoryResponse,
  transactionImport,
  transactionRow,
  walletFundingTransaction,
} from "./transaction-fixtures";

describe("transaction fixture factories", () => {
  it.each([
    multiProductPurchaseTransaction,
    preOrderPurchaseTransaction,
    subscriptionPurchaseTransaction,
    freeClaimTransaction,
    nullNamePurchaseTransaction,
    walletFundingTransaction,
  ])("applies API transaction overrides", (factory) => {
    const transaction = factory({ id: "override" });

    expect(transaction.id).toBe("override");
  });

  it("applies transaction row overrides", () => {
    expect(transactionRow({ productName: "Override" }).productName).toBe("Override");
  });

  it("returns fresh transactions and nested product lines for every call", () => {
    const first = multiProductPurchaseTransaction();
    const second = multiProductPurchaseTransaction();

    expect(first).not.toBe(second);
    expect(first.purchaseDetails).not.toBe(second.purchaseDetails);
    expect(first.purchaseDetails?.productPurchases).not.toBe(
      second.purchaseDetails?.productPurchases
    );
    expect(first.purchaseDetails?.productPurchases[0]).not.toBe(
      second.purchaseDetails?.productPurchases[0]
    );
  });

  it("copies caller transactions throughout aggregates and response wrappers", () => {
    const transaction = multiProductPurchaseTransaction();
    const transactions = [transaction];
    const firstAggregate = transactionAggregate(transactions);
    const secondAggregate = transactionAggregate(transactions);
    const firstResponse = transactionHistoryResponse(transactions);
    const secondResponse = transactionHistoryResponse(transactions);
    const firstResponseTransactions = firstResponse.data.transactionHistoryRetrieve.transactions;
    const secondResponseTransactions = secondResponse.data.transactionHistoryRetrieve.transactions;

    expect(firstAggregate).not.toBe(transactions);
    expect(firstAggregate).not.toBe(secondAggregate);
    expect(firstAggregate[0]).not.toBe(transaction);
    expect(firstAggregate[0]).not.toBe(secondAggregate[0]);
    expect(firstAggregate[0]?.purchaseDetails?.productPurchases[0]).not.toBe(
      secondAggregate[0]?.purchaseDetails?.productPurchases[0]
    );
    expect(firstResponseTransactions).not.toBe(transactions);
    expect(firstResponseTransactions).not.toBe(secondResponseTransactions);
    expect(firstResponseTransactions[0]).not.toBe(transaction);
    expect(firstResponseTransactions[0]?.purchaseDetails?.productPurchases[0]).not.toBe(
      secondResponseTransactions[0]?.purchaseDetails?.productPurchases[0]
    );
  });

  it("copies caller rows when constructing transaction imports", () => {
    const row = transactionImport().transactions[0];
    const first = transactionImport({ transactions: row ? [row] : [] });
    const second = transactionImport({ transactions: row ? [row] : [] });

    expect(first.transactions).not.toBe(second.transactions);
    expect(first.transactions[0]).not.toBe(row);
    expect(first.transactions[0]).not.toBe(second.transactions[0]);
  });
});
