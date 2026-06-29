import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionImport } from "@/domain/transactions";
import { createWindowStub } from "@/test/web-storage";

const STORAGE_KEY = "psn-playtime:transactions";

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

/** Import the store fresh so its module-level snapshot cache never leaks across tests. */
async function importStore() {
  return import("./transactions-store");
}

afterEach(() => {
  vi.resetModules();
});

describe(".loadTransactionImport", () => {
  it("returns null during server render when there is no window", async () => {
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toBeNull();
  });

  it("returns null when no import has been persisted", async () => {
    vi.stubGlobal("window", createWindowStub());
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toBeNull();
  });

  it("returns the decoded import when valid data is persisted", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toEqual(validImport);
  });

  it("decodes a persisted import that has no transactions", async () => {
    const empty: TransactionImport = { ...validImport, transactions: [] };
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toEqual(empty);
  });

  it("returns null when the persisted JSON is malformed", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, "{ not valid json");
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toBeNull();
  });

  it("returns null when the persisted JSON does not match the import schema", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions: "nope", importedAt: 1 }));
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toBeNull();
  });

  it("returns null when the persisted JSON is the literal null written by a clear", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, "null");
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    expect(loadTransactionImport()).toBeNull();
  });

  it("returns the cached reference when the raw string is unchanged between reads", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    const first = loadTransactionImport();
    const second = loadTransactionImport();

    expect(second).toBe(first);
  });

  it("re-reads from storage when the persisted raw string changes", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const { loadTransactionImport } = await importStore();

    const first = loadTransactionImport();

    const next: TransactionImport = { ...validImport, source: "another.host" };
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const second = loadTransactionImport();

    expect(first).toEqual(validImport);
    expect(second).toEqual(next);
  });
});

describe(".saveTransactionImport", () => {
  it("does nothing during server render when there is no window", async () => {
    const { saveTransactionImport } = await importStore();

    expect(() => saveTransactionImport(validImport)).not.toThrow();
  });
});

describe(".clearTransactionImport", () => {
  it("does nothing during server render when there is no window", async () => {
    const { clearTransactionImport } = await importStore();

    expect(() => clearTransactionImport()).not.toThrow();
  });
});
