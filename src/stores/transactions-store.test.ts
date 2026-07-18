import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionImport } from "@/domain/transactions";
import { createWindowStub } from "@/test/web-storage";
import { makeTransactionStore } from "./transactions-store";

const LEGACY_STORAGE_KEY = "psn-playtime:transactions";
const ACCOUNTS_STORAGE_KEY = "psn-playtime:transactions:accounts";

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

function makeStore() {
  return makeTransactionStore(AtomRegistry.make());
}

function stubWindow() {
  const win = createWindowStub();
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", win.localStorage);
  return win;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(".load", () => {
  it("returns null during server render", () => {
    expect(makeStore().load("acc-1")).toBeNull();
  });

  it("returns null for malformed persisted data", () => {
    const win = stubWindow();
    win.localStorage.setItem(ACCOUNTS_STORAGE_KEY, "{ not valid json");

    expect(makeStore().load("acc-1")).toBeNull();
  });
});

describe("ownerless legacy data", () => {
  it("is not attributed to any account on initial load", () => {
    const win = stubWindow();
    const raw = JSON.stringify(validImport);
    win.localStorage.setItem(LEGACY_STORAGE_KEY, raw);

    const store = makeStore();

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toBeNull();
    expect(win.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  });

  it("is not erased when an account with no keyed data is cleared", () => {
    const win = stubWindow();
    const raw = JSON.stringify(validImport);
    win.localStorage.setItem(LEGACY_STORAGE_KEY, raw);
    const store = makeStore();

    store.clear("acc-1");

    expect(win.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  });
});

describe("account isolation", () => {
  it("saves distinct imports for distinct accounts", () => {
    stubWindow();
    const store = makeStore();
    const second = { ...validImport, source: "second.account" };

    store.save("acc-1", validImport);
    store.save("acc-2", second);

    expect(store.load("acc-1")).toEqual(validImport);
    expect(store.load("acc-2")).toEqual(second);
  });

  it("clears one account without clearing another", () => {
    stubWindow();
    const store = makeStore();
    const second = { ...validImport, source: "second.account" };
    store.save("acc-1", validImport);
    store.save("acc-2", second);

    store.clear("acc-1");

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toEqual(second);
  });

  it("preserves unresolved legacy bytes across keyed save and clear", () => {
    const win = stubWindow();
    const raw = `  ${JSON.stringify(validImport)}\n`;
    win.localStorage.setItem(LEGACY_STORAGE_KEY, raw);
    const store = makeStore();
    const explicit = { ...validImport, source: "explicit.account" };

    store.save("acc-2", explicit);

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toEqual(explicit);
    expect(win.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);

    store.clear("acc-2");

    expect(store.load("acc-2")).toBeNull();
    expect(win.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  });
});

describe("server writes", () => {
  it("ignore save and clear", () => {
    const store = makeStore();

    expect(() => store.save("acc-1", validImport)).not.toThrow();
    expect(() => store.clear("acc-1")).not.toThrow();
  });
});
