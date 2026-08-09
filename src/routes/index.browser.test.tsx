import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { CachedAccount } from "@/stores/dashboard-store";
import { testDashboardStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { OnboardingContent } from "./index";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

const savedAccount: CachedAccount = {
  accountId: "acc-1",
  onlineId: "Ernxst_",
  avatarLabel: "Initials fallback",
  sourceLabel: "Imported from PlayStation",
  fetchedAt: "2026-08-09T00:00:00.000Z",
};

const secondAccount = {
  ...savedAccount,
  accountId: "acc-2",
  onlineId: "Zoe",
};

describe("Home", () => {
  it("takes a cold first use to the demo dashboard with one action", async () => {
    const { element } = createHarness(<OnboardingContent accounts={[]} hydrated />, {
      dashboard: <p>Demo dashboard destination</p>,
    });

    await render(element);

    await page.getByRole("link", { name: "Explore the demo", exact: true }).click();

    await expect.element(page.getByText("Demo dashboard destination")).toBeVisible();
  });

  it("takes one saved account directly to its dashboard with one action", async () => {
    const setActive = vi.spyOn(testDashboardStore, "setActive").mockReturnValue(undefined);
    onTestFinished(() => setActive.mockRestore());
    const { element } = createHarness(<OnboardingContent accounts={[savedAccount]} hydrated />, {
      dashboard: <p>Saved dashboard destination</p>,
    });

    await render(element);

    await page.getByRole("button", { name: "Continue to dashboard as Ernxst_" }).click();

    await expect.element(page.getByText("Saved dashboard destination")).toBeVisible();
    expect(setActive).toHaveBeenCalledExactlyOnceWith("acc-1");
  });

  it("keeps reconnect available without repeating saved-account continuation", async () => {
    const { element } = createHarness(<OnboardingContent accounts={[savedAccount]} hydrated />);

    await render(element);

    await page.getByText("Show connection", { exact: true }).click();

    await expect.element(page.getByLabelText("NPSSO token")).toBeVisible();
    await expect
      .element(page.getByRole("region", { name: "Continue with a saved account" }))
      .not.toBeInTheDocument();
  });

  it("makes each saved account a direct continuation target", async () => {
    const setActive = vi.spyOn(testDashboardStore, "setActive").mockReturnValue(undefined);
    onTestFinished(() => setActive.mockRestore());
    const { element } = createHarness(
      <OnboardingContent accounts={[savedAccount, secondAccount]} hydrated />,
      {
        dashboard: <p>Selected dashboard destination</p>,
      }
    );

    await render(element);

    await page.getByRole("button", { name: "Continue to dashboard as Zoe" }).click();

    await expect.element(page.getByText("Selected dashboard destination")).toBeVisible();
    expect(setActive).toHaveBeenCalledExactlyOnceWith("acc-2");
  });

  it.each([
    [1440, 900],
    [1024, 768],
    [390, 844],
    [320, 844],
  ])("keeps cold first use contained at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(<OnboardingContent accounts={[]} hydrated />);

    await render(element);

    await expect
      .element(page.getByRole("link", { name: "Explore the demo", exact: true }))
      .toBeVisible();
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  });

  it.each([
    [1440, 900],
    [1024, 768],
    [390, 844],
    [320, 844],
  ])("keeps saved-account continuation contained at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(<OnboardingContent accounts={[savedAccount]} hydrated />);

    await render(element);

    await expect
      .element(page.getByRole("button", { name: "Continue to dashboard as Ernxst_" }))
      .toBeVisible();
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  });
});
