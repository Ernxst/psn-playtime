import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
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

/**
 * Build the store from a fresh module import so its module-level snapshot cache
 * never leaks across tests. The registry is unused by `load` and a no-op for the
 * windowless `save`/`clear` guards, so a bare registry suffices here.
 */
async function importStore() {
  const { makeTransactionStore } = await import("./transactions-store");
  return makeTransactionStore(AtomRegistry.make());
}

afterEach(() => {
  vi.resetModules();
});

describe(".load", () => {
  it("returns null during server render when there is no window", async () => {
    const store = await importStore();

    expect(store.load()).toBeNull();
  });

  it("returns null when no import has been persisted", async () => {
    vi.stubGlobal("window", createWindowStub());
    const store = await importStore();

    expect(store.load()).toBeNull();
  });

  it("returns the decoded import when valid data is persisted", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const store = await importStore();

    expect(store.load()).toEqual(validImport);
  });

  it("decodes a persisted import that has no transactions", async () => {
    const empty: TransactionImport = { ...validImport, transactions: [] };
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    vi.stubGlobal("window", win);
    const store = await importStore();

    expect(store.load()).toEqual(empty);
  });

  it("returns null when the persisted JSON is malformed", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, "{ not valid json");
    vi.stubGlobal("window", win);
    const store = await importStore();

    expect(store.load()).toBeNull();
  });

  it("returns null when the persisted JSON does not match the import schema", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions: "nope", importedAt: 1 }));
    vi.stubGlobal("window", win);
    const store = await importStore();

    expect(store.load()).toBeNull();
  });

  it("returns null when the persisted JSON is the literal null written by a clear", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, "null");
    vi.stubGlobal("window", win);
    const store = await importStore();

    expect(store.load()).toBeNull();
  });

  it("returns the cached reference when the raw string is unchanged between reads", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const store = await importStore();

    const first = store.load();
    const second = store.load();

    expect(second).toBe(first);
  });

  it("re-reads from storage when the persisted raw string changes", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    vi.stubGlobal("window", win);
    const store = await importStore();

    const first = store.load();

    const next: TransactionImport = { ...validImport, source: "another.host" };
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const second = store.load();

    expect(first).toEqual(validImport);
    expect(second).toEqual(next);
  });
});

describe(".save", () => {
  it("does nothing during server render when there is no window", async () => {
    const store = await importStore();

    expect(() => store.save(validImport)).not.toThrow();
  });
});

describe(".clear", () => {
  it("does nothing during server render when there is no window", async () => {
    const store = await importStore();

    expect(() => store.clear()).not.toThrow();
  });
});
