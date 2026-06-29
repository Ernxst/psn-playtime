import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { DashboardHeader } from "./dashboard-header";

test("demo header shows the demo badge and hides the sign-out button", async () => {
  await render(<DashboardHeader data={demoDashboard} onSignOut={() => {}} signingOut={false} />);

  await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
  await expect.element(page.getByText("Demo", { exact: true })).toBeVisible();
  await expect.element(page.getByText("PS Plus")).toBeVisible();
  expect(page.getByRole("button", { name: /sign out/i }).query()).toBeNull();
});

test("signed-in header exposes a sign-out button that fires the callback", async () => {
  const onSignOut = vi.fn();
  const data = { ...demoDashboard, isDemo: false };

  await render(<DashboardHeader data={data} onSignOut={onSignOut} signingOut={false} />);

  expect(page.getByText("Demo").query()).toBeNull();

  await page.getByRole("button", { name: "Sign out" }).click();

  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test("signed-in header disables the button and shows progress while signing out", async () => {
  const data = { ...demoDashboard, isDemo: false };

  await render(<DashboardHeader data={data} onSignOut={() => {}} signingOut={true} />);

  const button = page.getByRole("button", { name: "Signing out…" });
  await expect.element(button).toBeVisible();
  await expect.element(button).toBeDisabled();
});
