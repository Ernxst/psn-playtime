import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/psn", () => ({
  getDashboard: vi.fn(),
  getRawgGenres: vi.fn(),
  getRawgFranchises: vi.fn(),
}));

import { setActiveAccount, writeCache } from "@/lib/cache";
import { demoDashboard } from "@/lib/psn/mock";
import { getDashboard } from "@/server/psn";
import { dashboardQueryOptions } from "./query";

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("dashboardQueryOptions cache short-circuit", () => {
  it("serves a fresh cached dashboard without calling getDashboard", async () => {
    const account = demoDashboard.profile.accountId;
    setActiveAccount(account);
    writeCache({ name: "dashboard", account }, demoDashboard);

    const result = await new QueryClient().fetchQuery(dashboardQueryOptions);

    expect(getDashboard).not.toHaveBeenCalled();
    expect(result).toEqual(demoDashboard);
  });

  it("fetches via getDashboard when no fresh cache exists", async () => {
    vi.mocked(getDashboard).mockResolvedValue(demoDashboard);

    const result = await new QueryClient().fetchQuery(dashboardQueryOptions);

    expect(getDashboard).toHaveBeenCalledTimes(1);
    expect(result).toEqual(demoDashboard);
  });
});
