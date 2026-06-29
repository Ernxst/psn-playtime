import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionImport } from "@/domain/transactions";
import { EffectAtomProvider } from "@/runtime/provider.effect";
import {
  clearTransactionImport,
  loadTransactionImport,
  saveTransactionImport,
  useTransactionImport,
} from "./transactions-store";

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
  it("re-renders with the imported transactions after a save", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: EffectAtomProvider });

    await expect.element(page.getByText("no import")).toBeVisible();

    saveTransactionImport(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();
  });

  it("re-renders back to no import after a clear", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: EffectAtomProvider });
    saveTransactionImport(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();

    clearTransactionImport();

    await expect.element(page.getByText("no import")).toBeVisible();
  });
});

describe(".saveTransactionImport", () => {
  it("persists the import so a direct read sees it", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: EffectAtomProvider });

    saveTransactionImport(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();
    expect(loadTransactionImport()).toEqual(validImport);
  });
});

describe(".clearTransactionImport", () => {
  it("leaves a direct read returning null", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: EffectAtomProvider });
    saveTransactionImport(validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();

    clearTransactionImport();

    await expect.element(page.getByText("no import")).toBeVisible();
    expect(loadTransactionImport()).toBeNull();
  });
});
