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

describe(".startCrossTabSync", () => {
  it("registers exactly one storage listener across repeat calls with the same registry", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    vi.stubGlobal("window", win);
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    startCrossTabSync(registry);
    startCrossTabSync(registry);

    expect(addEventListener).toHaveBeenCalledExactlyOnceWith("storage", expect.any(Function));
  });

  it("returns the same teardown when called twice with the same registry", async () => {
    vi.stubGlobal("window", createWindowStub());
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    const first = startCrossTabSync(registry);
    const second = startCrossTabSync(registry);

    expect(second).toBe(first);
  });

  it("removes the registered listener when the returned teardown runs", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    const removeEventListener = vi.spyOn(win, "removeEventListener");
    vi.stubGlobal("window", win);
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    const stop = startCrossTabSync(registry);
    const handler = addEventListener.mock.calls[0]?.[1];
    stop();

    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith("storage", handler);
  });

  it("registers a fresh listener after a teardown so sync can be restarted on the same registry", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    vi.stubGlobal("window", win);
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    startCrossTabSync(registry)();
    startCrossTabSync(registry);

    expect(addEventListener).toHaveBeenCalledTimes(2);
  });

  it("returns a no-op teardown during server render when there is no window", async () => {
    const { startCrossTabSync } = await import("./transactions-store");

    const stop = startCrossTabSync(AtomRegistry.make());

    expect(stop).toBeTypeOf("function");
    expect(() => stop()).not.toThrow();
  });
});
