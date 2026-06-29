import { afterEach, describe, expect, it, vi } from "vitest";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { createWindowStub } from "@/test/web-storage";

const ACTIVE_KEY = "psn-playtime:dashboard-active";
const CHANGE_EVENT = "psn-playtime:dashboard-changed";

const dataKey = (accountId: string): string => `psn-playtime:dashboard:${accountId}`;

const otherDashboard: DashboardData = {
  ...demoDashboard,
  profile: { ...demoDashboard.profile, accountId: "acc-2", onlineId: "SecondPlayer" },
};

/** Import the store fresh so its module-level snapshot caches never leak across tests. */
async function importStore() {
  return import("./dashboard-store");
}

afterEach(() => {
  vi.resetModules();
});

describe(".loadDashboard", () => {
  it("returns null during server render when there is no window", async () => {
    const { loadDashboard } = await importStore();

    expect(loadDashboard("demo")).toBeNull();
  });

  it("returns null when no dashboard is cached for the account", async () => {
    vi.stubGlobal("window", createWindowStub());
    const { loadDashboard } = await importStore();

    expect(loadDashboard("demo")).toBeNull();
  });

  it("returns the cached dashboard for the account", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(dataKey("demo"), JSON.stringify(demoDashboard));
    vi.stubGlobal("window", win);
    const { loadDashboard } = await importStore();

    expect(loadDashboard("demo")).toEqual(demoDashboard);
  });

  it("returns null when the cached JSON is malformed", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(dataKey("demo"), "{ not valid json");
    vi.stubGlobal("window", win);
    const { loadDashboard } = await importStore();

    expect(loadDashboard("demo")).toBeNull();
  });

  it("returns null when the cached dashboard has an invalid shape", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(dataKey("demo"), JSON.stringify({ profile: { accountId: "demo" } }));
    vi.stubGlobal("window", win);
    const { loadDashboard } = await importStore();

    expect(loadDashboard("demo")).toBeNull();
  });
});

describe(".saveDashboard", () => {
  it("persists the dashboard under its account-scoped key", async () => {
    const win = createWindowStub();
    vi.stubGlobal("window", win);
    const { saveDashboard } = await importStore();

    saveDashboard(demoDashboard);

    expect(JSON.parse(win.localStorage.getItem(dataKey("demo")) ?? "null")).toEqual(demoDashboard);
  });

  it("keys each entry by account id so different accounts do not collide", async () => {
    const win = createWindowStub();
    vi.stubGlobal("window", win);
    const { saveDashboard } = await importStore();

    saveDashboard(demoDashboard);
    saveDashboard(otherDashboard);

    expect(JSON.parse(win.localStorage.getItem(dataKey("demo")) ?? "null")).toEqual(demoDashboard);
    expect(JSON.parse(win.localStorage.getItem(dataKey("acc-2")) ?? "null")).toEqual(
      otherDashboard
    );
  });

  it("notifies same-tab subscribers of the change", async () => {
    const onChange = vi.fn();
    const win = createWindowStub();
    win.addEventListener(CHANGE_EVENT, onChange);
    vi.stubGlobal("window", win);
    const { saveDashboard } = await importStore();

    saveDashboard(demoDashboard);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing during server render when there is no window", async () => {
    const { saveDashboard } = await importStore();

    expect(() => saveDashboard(demoDashboard)).not.toThrow();
  });
});

describe(".setActiveAccount", () => {
  it("records the active-account pointer", async () => {
    const win = createWindowStub();
    vi.stubGlobal("window", win);
    const { setActiveAccount } = await importStore();

    setActiveAccount("demo");

    expect(win.localStorage.getItem(ACTIVE_KEY)).toBe("demo");
  });

  it("notifies same-tab subscribers of the change", async () => {
    const onChange = vi.fn();
    const win = createWindowStub();
    win.addEventListener(CHANGE_EVENT, onChange);
    vi.stubGlobal("window", win);
    const { setActiveAccount } = await importStore();

    setActiveAccount("demo");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing during server render when there is no window", async () => {
    const { setActiveAccount } = await importStore();

    expect(() => setActiveAccount("demo")).not.toThrow();
  });
});

describe(".clearActiveAccount", () => {
  it("removes the active-account pointer", async () => {
    const win = createWindowStub();
    win.localStorage.setItem(ACTIVE_KEY, "demo");
    vi.stubGlobal("window", win);
    const { clearActiveAccount } = await importStore();

    clearActiveAccount();

    expect(win.localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("notifies same-tab subscribers of the change", async () => {
    const onChange = vi.fn();
    const win = createWindowStub();
    win.addEventListener(CHANGE_EVENT, onChange);
    vi.stubGlobal("window", win);
    const { clearActiveAccount } = await importStore();

    clearActiveAccount();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing during server render when there is no window", async () => {
    const { clearActiveAccount } = await importStore();

    expect(() => clearActiveAccount()).not.toThrow();
  });
});
