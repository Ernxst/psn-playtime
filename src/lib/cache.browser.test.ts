import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  clearActiveAccount,
  clearCache,
  DEFAULT_TTL_MS,
  getActiveAccount,
  readCache,
  setActiveAccount,
  writeCache,
} from "./cache";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const FIXED = 1_700_000_000_000;
const clock = (ms: number) => () => ms;

describe(".readCache / .writeCache", () => {
  it("returns the stored value within the TTL", () => {
    writeCache({ name: "dashboard" }, { hours: 42 }, { now: clock(FIXED) });

    const result = readCache<{ hours: number }>(
      { name: "dashboard" },
      { now: clock(FIXED + DEFAULT_TTL_MS - 1) }
    );

    expect(result).toEqual({ hours: 42 });
  });

  it("returns null once the entry is past its TTL", () => {
    writeCache({ name: "dashboard" }, { hours: 42 }, { now: clock(FIXED) });

    const result = readCache(
      { name: "dashboard" },
      { now: clock(FIXED + DEFAULT_TTL_MS + 1) }
    );

    expect(result).toBeNull();
  });

  it("returns null for an absent entry", () => {
    expect(readCache({ name: "missing" })).toBeNull();
  });

  it("returns null for a malformed entry", () => {
    localStorage.setItem("psn-playtime:cache:dashboard", "{ not json");

    expect(readCache({ name: "dashboard" })).toBeNull();
  });

  it("returns null for a stored value lacking a cachedAt stamp", () => {
    localStorage.setItem("psn-playtime:cache:dashboard", JSON.stringify({ value: 1 }));

    expect(readCache({ name: "dashboard" })).toBeNull();
  });

  it("isolates entries by account", () => {
    writeCache({ name: "dashboard", account: "a" }, { hours: 1 }, { now: clock(FIXED) });
    writeCache({ name: "dashboard", account: "b" }, { hours: 2 }, { now: clock(FIXED) });

    const a = readCache<{ hours: number }>(
      { name: "dashboard", account: "a" },
      { now: clock(FIXED) }
    );
    const b = readCache<{ hours: number }>(
      { name: "dashboard", account: "b" },
      { now: clock(FIXED) }
    );

    expect(a).toEqual({ hours: 1 });
    expect(b).toEqual({ hours: 2 });
  });

  it("does not surface an account-keyed entry under the bare name", () => {
    writeCache({ name: "dashboard", account: "a" }, { hours: 1 }, { now: clock(FIXED) });

    expect(readCache({ name: "dashboard" }, { now: clock(FIXED) })).toBeNull();
  });

  it("swallows a thrown setItem so a quota error never propagates", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockThrow(new DOMException("QuotaExceededError"));

    expect(() => writeCache({ name: "dashboard" }, { hours: 1 })).not.toThrow();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe(".clearCache", () => {
  it("removes a previously stored entry", () => {
    writeCache({ name: "dashboard" }, { hours: 1 }, { now: clock(FIXED) });

    clearCache({ name: "dashboard" });

    expect(readCache({ name: "dashboard" }, { now: clock(FIXED) })).toBeNull();
  });
});

describe(".getActiveAccount / .setActiveAccount / .clearActiveAccount", () => {
  it("round-trips the active account", () => {
    onTestFinished(clearActiveAccount);

    setActiveAccount("account-123");

    expect(getActiveAccount()).toBe("account-123");
  });

  it("returns null after the active account is cleared", () => {
    setActiveAccount("account-123");

    clearActiveAccount();

    expect(getActiveAccount()).toBeNull();
  });
});
