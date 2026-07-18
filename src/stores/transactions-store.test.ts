import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionImport } from "@/domain/transactions";
import { createWindowStub } from "@/test/web-storage";
import { makeTransactionStore } from "./transactions-store";

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

function makeStore(accountIds: readonly string[] = []) {
  return makeTransactionStore(AtomRegistry.make(), () => accountIds);
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
    win.localStorage.setItem(STORAGE_KEY, "{ not valid json");

    expect(makeStore(["acc-1"]).load("acc-1")).toBeNull();
  });
});

describe("legacy migration", () => {
  it("assigns a legacy import to the sole cached account", () => {
    const win = stubWindow();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));

    const store = makeStore(["acc-1"]);

    expect(store.load("acc-1")).toEqual(validImport);
    expect(store.load("acc-2")).toBeNull();
  });

  it("preserves an ownerless import when there are no cached accounts", () => {
    const win = stubWindow();
    const raw = JSON.stringify(validImport);
    win.localStorage.setItem(STORAGE_KEY, raw);

    const store = makeStore();

    expect(store.load("acc-1")).toBeNull();
    expect(win.localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("preserves an ownerless import when there are multiple cached accounts", () => {
    const win = stubWindow();
    const raw = JSON.stringify(validImport);
    win.localStorage.setItem(STORAGE_KEY, raw);

    const store = makeStore(["acc-1", "acc-2"]);

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toBeNull();
    expect(win.localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("claims preserved legacy data when the cached accounts become unambiguous", () => {
    const win = stubWindow();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    const accountIds: string[] = [];
    const store = makeTransactionStore(AtomRegistry.make(), () => accountIds);

    accountIds.push("acc-1");
    store.migrateLegacy();

    expect(store.load("acc-1")).toEqual(validImport);
  });

  it("does not erase preserved legacy data when an unrelated account is cleared", () => {
    const win = stubWindow();
    const raw = JSON.stringify(validImport);
    win.localStorage.setItem(STORAGE_KEY, raw);
    const store = makeStore(["acc-1", "acc-2"]);

    store.clear("acc-1");

    expect(win.localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
});

describe("account isolation", () => {
  it("saves distinct imports for distinct accounts", () => {
    stubWindow();
    const store = makeStore(["acc-1", "acc-2"]);
    const second = { ...validImport, source: "second.account" };

    store.save("acc-1", validImport);
    store.save("acc-2", second);

    expect(store.load("acc-1")).toEqual(validImport);
    expect(store.load("acc-2")).toEqual(second);
  });

  it("clears one account without clearing another", () => {
    stubWindow();
    const store = makeStore(["acc-1", "acc-2"]);
    const second = { ...validImport, source: "second.account" };
    store.save("acc-1", validImport);
    store.save("acc-2", second);

    store.clear("acc-1");

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toEqual(second);
  });

  it("allows an explicit import to supersede unresolved legacy data", () => {
    const win = stubWindow();
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(validImport));
    const store = makeStore(["acc-1", "acc-2"]);
    const explicit = { ...validImport, source: "explicit.account" };

    store.save("acc-2", explicit);

    expect(store.load("acc-1")).toBeNull();
    expect(store.load("acc-2")).toEqual(explicit);
  });
});

describe("server writes", () => {
  it("ignore save and clear", () => {
    const store = makeStore();

    expect(() => store.save("acc-1", validImport)).not.toThrow();
    expect(() => store.clear("acc-1")).not.toThrow();
  });
});
