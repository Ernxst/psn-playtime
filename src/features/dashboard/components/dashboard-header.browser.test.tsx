import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { createHarness } from "@/test/harness";
import { DashboardHeader } from "./dashboard-header";

describe("DashboardHeader", () => {
  it("demo header shows the demo badge and hides the sign-out button", async () => {
    const { element } = createHarness(<DashboardHeader data={demoDashboard} signingOut={false} />);
    await render(element);

    await expect
      .element(page.getByRole("heading", { name: demoDashboard.profile.onlineId }))
      .toBeVisible();
    await expect.element(page.getByText("Deterministic demo data", { exact: true })).toBeVisible();
    await expect.element(page.getByText("PS Plus")).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("signed-in header exposes a sign-out button that fires the callback", async () => {
    const onSignOut = vi.fn();
    const data = {
      ...demoDashboard,
      profile: { ...demoDashboard.profile, sourceLabel: "Imported from PlayStation" },
      isDemo: false,
    };

    const { element } = createHarness(
      <DashboardHeader data={data} onRefresh={vi.fn()} onSignOut={onSignOut} signingOut={false} />
    );
    await render(element);

    await expect.element(page.getByText("Demo data", { exact: true })).not.toBeInTheDocument();
    await expect
      .element(page.getByText("Imported from PlayStation", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Refresh" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("signed-in header disables the button and shows progress while signing out", async () => {
    const data = {
      ...demoDashboard,
      profile: { ...demoDashboard.profile, sourceLabel: "Imported from PlayStation" },
      isDemo: false,
    };

    const { element } = createHarness(
      <DashboardHeader data={data} onRefresh={vi.fn()} onSignOut={() => {}} signingOut={true} />
    );
    await render(element);

    const button = page.getByRole("button", { name: "Signing out…" });

    await expect.element(button).toBeVisible();
    await expect.element(button).toBeDisabled();
  });
});
