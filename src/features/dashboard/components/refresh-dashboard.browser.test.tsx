import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { createHarness } from "@/test/harness";
import { RefreshDashboard } from "./refresh-dashboard";

function view(onRefresh: (npsso: string) => Promise<void>) {
  return createHarness(
    <>
      <RefreshDashboard onRefresh={onRefresh} />
      <Toaster />
    </>
  ).element;
}

describe("RefreshDashboard", () => {
  it("opens a token form that explains the one-time refresh", async () => {
    await render(view(vi.fn()));

    await page.getByRole("button", { name: "Refresh" }).click();

    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation data" }))
      .toBeVisible();
    await expect.element(page.getByLabelText("npsso token")).toHaveAttribute("type", "password");
    await expect.element(page.getByText(/sent once for this refresh/)).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "Sign in to PlayStation" }))
      .toHaveAttribute("href", "https://www.playstation.com/");
    await expect.element(page.getByRole("link", { name: /SSO cookie page/ })).toBeVisible();
  });

  it("normalises the token and closes after a successful refresh", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByLabelText("npsso token").fill('{"npsso":"fresh-token"}');
    await page.getByRole("button", { name: "Refresh data" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("fresh-token");
    await expect.element(page.getByText("PlayStation data refreshed.")).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation data" }))
      .not.toBeInTheDocument();
  });

  it("keeps the form open when the token belongs to another account", async () => {
    const onRefresh = vi
      .fn()
      .mockRejectedValue(new Error("That token belongs to a different PlayStation account."));
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByLabelText("npsso token").fill("other-account-token");
    await page.getByRole("button", { name: "Refresh data" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("other-account-token");
    await expect
      .element(page.getByText("That token belongs to a different PlayStation account."))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation data" }))
      .toBeVisible();
  });

  it("keeps the form open when PlayStation rejects the refresh", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("PlayStation is unavailable right now."));
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByLabelText("npsso token").fill("fresh-token");
    await page.getByRole("button", { name: "Refresh data" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("fresh-token");
    await expect.element(page.getByText("PlayStation is unavailable right now.")).toBeVisible();
    await expect.element(page.getByLabelText("npsso token")).toHaveValue("fresh-token");
  });

  it("rejects an empty token without starting a refresh", async () => {
    const onRefresh = vi.fn();
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByRole("button", { name: "Refresh data" }).click();

    expect(onRefresh).not.toHaveBeenCalled();
    await expect.element(page.getByText("Paste your npsso token first.")).toBeVisible();
  });
});
