import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { createHarness } from "@/test/harness";
import { DashboardHeader } from "./dashboard-header";

describe("DashboardHeader", () => {
  it("demo header shows the demo badge and hides the sign-out button", async () => {
    const { element } = createHarness(
      <DashboardHeader
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={() => {}}
        signingOut={false}
      />
    );
    await render(element);

    await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
    await expect.element(page.getByText("Demo", { exact: true })).toBeVisible();
    await expect.element(page.getByText("PS Plus")).toBeVisible();
    expect(page.getByRole("button", { name: "Refresh" }).query()).toBeNull();
    expect(page.getByRole("button", { name: /sign out/i }).query()).toBeNull();
  });

  it("signed-in header exposes a sign-out button that fires the callback", async () => {
    const onSignOut = vi.fn();
    const data = { ...demoDashboard, isDemo: false };

    const { element } = createHarness(
      <DashboardHeader data={data} onRefresh={vi.fn()} onSignOut={onSignOut} signingOut={false} />
    );
    await render(element);

    expect(page.getByText("Demo").query()).toBeNull();
    await expect.element(page.getByRole("button", { name: "Refresh" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("signed-in header disables the button and shows progress while signing out", async () => {
    const data = { ...demoDashboard, isDemo: false };

    const { element } = createHarness(
      <DashboardHeader data={data} onRefresh={vi.fn()} onSignOut={() => {}} signingOut={true} />
    );
    await render(element);

    const button = page.getByRole("button", { name: "Signing out…" });

    await expect.element(button).toBeVisible();
    await expect.element(button).toBeDisabled();
  });
});
