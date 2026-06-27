import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/psn", () => ({
  getDashboard: vi.fn(() => Promise.resolve({ sentinel: true })),
}));

import { getDashboard } from "@/server/psn";
import { dashboardQueryOptions } from "./query";

describe("dashboardQueryOptions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keys the query under 'dashboard'", () => {
    expect(dashboardQueryOptions.queryKey).toEqual(["dashboard"]);
  });

  it("delegates the queryFn to getDashboard", async () => {
    const client = new QueryClient();

    const result = await client.fetchQuery(dashboardQueryOptions);

    expect(getDashboard).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sentinel: true });
  });
});
