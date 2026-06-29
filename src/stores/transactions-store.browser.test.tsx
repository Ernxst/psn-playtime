import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionImport } from "@/domain/transactions";
import { TestAtomProvider, testRegistry } from "@/test/atom-registry";
import {
  makeTransactionStore,
  startCrossTabSync,
  useTransactionImport,
} from "./transactions-store";

// Build the store from the same registry TestAtomProvider seeds, so imperative
// writes notify the hook rendered under that provider.
const store = makeTransactionStore(testRegistry);

// Register the app-lifetime `storage` listener over the shared test registry,
// mirroring the single client-boot registration in `getContext`.
startCrossTabSync(testRegistry);

// Mirrors TRANSACTIONS_STORAGE_KEY in transactions-store.ts — the localStorage
// slot another tab writes to, which a cross-tab `storage` event carries.
const TRANSACTIONS_STORAGE_KEY = "psn-playtime:transactions";

/** Simulate another tab's localStorage write landing as a `storage` event here. */
function dispatchCrossTabWrite(newValue: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key: TRANSACTIONS_STORAGE_KEY, newValue }));
}

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

describe(".startCrossTabSync", () => {
  it("re-renders with another tab's import when a storage event lands", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("no import")).toBeVisible();

    dispatchCrossTabWrite(JSON.stringify(validImport));

    await expect.element(page.getByText("1 imported")).toBeVisible();
  });

  it("clears the import when another tab removes the key", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });
    dispatchCrossTabWrite(JSON.stringify(validImport));

    await expect.element(page.getByText("1 imported")).toBeVisible();

    dispatchCrossTabWrite(null);

    await expect.element(page.getByText("no import")).toBeVisible();
  });

  it("ignores a malformed storage payload, leaving no import", async () => {
    onTestFinished(() => localStorage.clear());

    await render(<ImportedCount />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("no import")).toBeVisible();

    dispatchCrossTabWrite("{ not valid json");

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
