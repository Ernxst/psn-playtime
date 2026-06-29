import { useReducer } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { saveDashboard, useActiveDashboard, useCachedAccounts } from "./dashboard-store";

const ACTIVE_KEY = "psn-playtime:dashboard-active";
const dataKey = (accountId: string): string => `psn-playtime:dashboard:${accountId}`;

function ActiveOnlineId() {
  const data = useActiveDashboard();
  return <p>{data?.profile.onlineId}</p>;
}

describe(".useActiveDashboard", () => {
  it("falls back to demo data when the active cached dashboard has an invalid shape", async () => {
    localStorage.setItem(ACTIVE_KEY, "demo");
    localStorage.setItem(dataKey("demo"), JSON.stringify({ profile: { accountId: "demo" } }));

    await render(<ActiveOnlineId />);

    await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();
  });
});

// A later write keeps the same account but changes its raw string, so the per-entry
// cache must re-parse this entry while leaving unchanged entries untouched.
const updatedDashboard: DashboardData = {
  ...demoDashboard,
  fetchedAt: "2025-01-01T00:00:00.000Z",
};

/** Surfaces the cached accounts and exposes buttons to force a re-render or a store write. */
function CachedAccounts() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const accounts = useCachedAccounts();
  return (
    <>
      <p>{accounts.map((account) => account.onlineId).join(",") || "none"}</p>
      <button type="button" onClick={rerender}>
        Re-render
      </button>
      <button type="button" onClick={() => saveDashboard(updatedDashboard)}>
        Update
      </button>
    </>
  );
}

describe(".useCachedAccounts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not re-parse an unchanged cached dashboard across snapshot reads", async () => {
    onTestFinished(() => localStorage.clear());
    localStorage.setItem(dataKey("demo"), JSON.stringify(demoDashboard));
    const parseSpy = vi.spyOn(JSON, "parse");

    await render(<CachedAccounts />);
    await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();

    parseSpy.mockClear();
    await page.getByRole("button", { name: "Re-render" }).click();

    expect(parseSpy).not.toHaveBeenCalledWith(JSON.stringify(demoDashboard));
  });

  it("re-parses a cached dashboard after its stored value changes", async () => {
    onTestFinished(() => localStorage.clear());
    localStorage.setItem(dataKey("demo"), JSON.stringify(demoDashboard));
    const parseSpy = vi.spyOn(JSON, "parse");

    await render(<CachedAccounts />);
    await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();

    parseSpy.mockClear();
    await page.getByRole("button", { name: "Update" }).click();

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledWith(JSON.stringify(updatedDashboard));
  });
});
