import { afterEach, describe, expect, it } from "vitest";
import { forgetAccount, loadRememberedAccounts, rememberAccount } from "./remembered-accounts";

// Dummy, non-secret stand-in for an npsso token.
const DUMMY_NPSSO = "dummy-npsso-token";

afterEach(() => {
  window.localStorage.clear();
});

describe(".rememberAccount", () => {
  it("persists an opted-in account so it can be loaded back", () => {
    rememberAccount({ onlineId: "Ernxst_", avatarUrl: "https://x/a.png", npsso: DUMMY_NPSSO });

    expect(loadRememberedAccounts()).toEqual([
      { onlineId: "Ernxst_", avatarUrl: "https://x/a.png", npsso: DUMMY_NPSSO },
    ]);
  });

  it("moves a re-remembered account to the front and de-dupes by onlineId", () => {
    rememberAccount({ onlineId: "Ernxst_", npsso: DUMMY_NPSSO });
    rememberAccount({ onlineId: "Other", npsso: DUMMY_NPSSO });
    rememberAccount({ onlineId: "Ernxst_", npsso: "fresh" });

    expect(loadRememberedAccounts().map((a) => a.onlineId)).toEqual(["Ernxst_", "Other"]);
    expect(loadRememberedAccounts()[0]?.npsso).toBe("fresh");
  });
});

describe(".forgetAccount", () => {
  it("removes the named account and keeps the rest", () => {
    rememberAccount({ onlineId: "Ernxst_", npsso: DUMMY_NPSSO });
    rememberAccount({ onlineId: "Other", npsso: DUMMY_NPSSO });

    forgetAccount("Ernxst_");

    expect(loadRememberedAccounts().map((a) => a.onlineId)).toEqual(["Other"]);
  });
});

describe(".loadRememberedAccounts", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadRememberedAccounts()).toEqual([]);
  });

  it("returns an empty list when the stored value is corrupt", () => {
    window.localStorage.setItem("psn-playtime:remembered-accounts", "not json");

    expect(loadRememberedAccounts()).toEqual([]);
  });
});
