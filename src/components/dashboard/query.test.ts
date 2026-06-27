import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// Demo payloads are never cached, so the queryFn returns them verbatim — which
// keeps this delegation test independent of the localStorage cache wiring.
vi.mock("@/server/psn", () => ({
  getDashboard: vi.fn(() => Promise.resolve({ isDemo: true })),
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
    expect(result).toEqual({ isDemo: true });
  });
});
