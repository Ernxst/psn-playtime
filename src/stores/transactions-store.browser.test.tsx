import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionImport } from "@/domain/transactions";
import { TestAtomProvider, testRegistry } from "@/test/atom-registry";
import { makeTransactionStore, useTransactionImport } from "./transactions-store";

// Build the store from the same registry TestAtomProvider seeds, so imperative
// writes notify the hook rendered under that provider.
const store = makeTransactionStore(testRegistry);

const validImport: TransactionImport = {
  transactions: [
    {
      transactionId: "T1",
      key: "k1",
      date: "2024-01-01",
      transactionType: "PURCHASE",
      kind: "purchase",
      productName: "Some Game",
      quantity: 1,
      amountMinor: 4490,
      currency: "£",
      displayAmount: "£44.90",
    },
  ],
  importedAt: "2024-01-02T00:00:00.000Z",
  source: "store.playstation.com",
};

/** Surfaces the hook's value so a re-render is observable through the DOM. */
function ImportedCount() {
  const imported = useTransactionImport();
  return <p>{imported ? `${imported.transactions.length} imported` : "no import"}</p>;
}

describe(".useTransactionImport", () => {
  it("re-renders with the imported transactions after a store save", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("no import")).toBeVisible();

    store.save(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();
  });

  it("re-renders back to no import after a store clear", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });
    store.save(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();

    store.clear();

    await expect.element(page.getByText("no import")).toBeVisible();
  });
});

describe(".save", () => {
  it("persists the import so a direct store read sees it", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });

    store.save(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();
    expect(store.load()).toEqual(validImport);
  });
});

describe(".clear", () => {
  it("leaves a direct store read returning null", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });
    store.save(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();

    store.clear();

    await expect.element(page.getByText("no import")).toBeVisible();
    expect(store.load()).toBeNull();
  });
});
