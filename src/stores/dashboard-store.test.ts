import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { describe, expect, it, vi } from "vitest";
import * as Dashboard from "@/test/factories/dashboard";
import { makeDashboardStore } from "./dashboard-store";

/**
 * Build the store over a bare registry. The registry is unused by `load` and a
 * no-op for the windowless `save`/`setActive`/`clearActive` guards, so a fresh
 * registry per test isolates state without seeding `localStorage`. Reactivity
 * and round-trips are covered by the browser test, where a real registry and
 * `localStorage` exist.
 */
function makeStore() {
  return makeDashboardStore(AtomRegistry.make());
}

describe(".load", () => {
  it("returns null during server render when there is no window", () => {
    expect(makeStore().load("demo")).toBeNull();
  });
});

describe(".save", () => {
  it("does nothing during server render when there is no window", () => {
    expect(() => makeStore().save(Dashboard.data())).not.toThrow();
  });
});

describe(".setActive", () => {
  it("does nothing during server render when there is no window", () => {
    expect(() => makeStore().setActive("demo")).not.toThrow();
  });
});

describe(".clearActive", () => {
  it("does nothing during server render when there is no window", () => {
    expect(() => makeStore().clearActive()).not.toThrow();
  });
});

describe(".remove", () => {
  it("does nothing during server render when there is no window", () => {
    expect(() => makeStore().remove("demo")).not.toThrow();
  });
});

describe("server-side rendering", () => {
  it("never reads or writes localStorage without a window", () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem, removeItem });
    const store = makeStore();

    expect(store.load("demo")).toBeNull();

    store.save(Dashboard.data());
    store.setActive("demo");
    store.clearActive();
    store.remove("demo");

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
