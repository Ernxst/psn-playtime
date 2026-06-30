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
  it("acquires exactly one storage listener across repeat mounts on the same registry", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    vi.stubGlobal("window", win);
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    startCrossTabSync(registry);
    startCrossTabSync(registry);

    await vi.waitFor(() => {
      expect(addEventListener).toHaveBeenCalledExactlyOnceWith("storage", expect.any(Function));
    });
  });

  it("releases the listener when the registry scope is disposed", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    const removeEventListener = vi.spyOn(win, "removeEventListener");
    vi.stubGlobal("window", win);
    const { startCrossTabSync } = await import("./transactions-store");
    const registry = AtomRegistry.make();

    startCrossTabSync(registry);
    await vi.waitFor(() => expect(addEventListener).toHaveBeenCalledOnce());
    const handler = addEventListener.mock.calls[0]?.[1];

    registry.dispose();

    await vi.waitFor(() => {
      expect(removeEventListener).toHaveBeenCalledExactlyOnceWith("storage", handler);
    });
  });

  it("returns the registry unmount handle", async () => {
    vi.stubGlobal("window", createWindowStub());
    const { startCrossTabSync } = await import("./transactions-store");

    const unmount = startCrossTabSync(AtomRegistry.make());

    expect(unmount).toBeTypeOf("function");
    expect(() => unmount()).not.toThrow();
  });

  it("does not touch window during server render when there is no window", async () => {
    const { startCrossTabSync } = await import("./transactions-store");

    const unmount = startCrossTabSync(AtomRegistry.make());

    expect(unmount).toBeTypeOf("function");
    expect(() => unmount()).not.toThrow();
  });
});
