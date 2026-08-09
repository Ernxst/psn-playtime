import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { createHarness } from "@/test/harness";
import { RefreshDashboard } from "./refresh-dashboard";

function view(
  onRefresh: (npsso: string) => Promise<void>,
  options?: { safeDemo?: boolean; onComplete?: () => void }
) {
  return createHarness(
    <>
      <RefreshDashboard
        onRefresh={onRefresh}
        safeDemo={options?.safeDemo}
        onComplete={options?.onComplete}
      />
      <Toaster />
    </>
  ).element;
}

describe("RefreshDashboard", () => {
  it("opens a token form that explains the one-time refresh", async () => {
    await render(view(vi.fn()));

    await page.getByRole("button", { name: "Refresh archive" }).click();

    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .toBeVisible();
    await expect.element(page.getByLabelText("npsso token")).toHaveAttribute("type", "password");
    await expect.element(page.getByText(/treat it like your password/)).toBeVisible();
    await expect.element(page.getByText(/remains available if the refresh fails/)).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "Sign in to PlayStation" }))
      .toHaveAttribute("href", "https://www.playstation.com/");
    await expect.element(page.getByRole("link", { name: /SSO cookie page/ })).toBeVisible();
  });

  it("normalises the token and closes after a successful refresh", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    await render(view(onRefresh));

    const trigger = page.getByRole("button", { name: "Refresh archive" });
    await trigger.click();
    await page.getByLabelText("npsso token").fill('{"npsso":"fresh-token"}');
    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("fresh-token");
    await expect
      .element(page.getByText(/updated archive is saved in this browser and ready to browse/))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("keeps the form open when the token belongs to another account", async () => {
    const onRefresh = vi
      .fn()
      .mockRejectedValue(new Error("That token belongs to a different PlayStation account."));
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh archive" }).click();
    await page.getByLabelText("npsso token").fill("other-account-token");
    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("other-account-token");
    await expect
      .element(page.getByText("That token belongs to a different PlayStation account."))
      .toBeVisible();
    await expect.element(page.getByText(/saved archive is unchanged/)).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .toBeVisible();
  });

  it("keeps the form open when PlayStation rejects the refresh", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("PlayStation is unavailable right now."));
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh archive" }).click();
    await page.getByLabelText("npsso token").fill("fresh-token");
    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("fresh-token");
    await expect.element(page.getByText("PlayStation is unavailable right now.")).toBeVisible();
    await expect.element(page.getByLabelText("npsso token")).toHaveValue("fresh-token");
  });

  it("rejects an empty token without starting a refresh", async () => {
    const onRefresh = vi.fn();
    await render(view(onRefresh));

    await page.getByRole("button", { name: "Refresh archive" }).click();
    const token = page.getByLabelText("npsso token");
    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    expect(onRefresh).not.toHaveBeenCalled();
    await expect
      .element(page.getByText("Paste your npsso token to refresh this archive."))
      .toBeVisible();
    await expect.element(token).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(token)
      .toHaveAttribute("aria-describedby", "refresh-guidance refresh-error");
    await expect.element(token).toHaveFocus();
  });

  it("exercises failure retention and success without accepting a real token in safe demo mode", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    await render(view(onRefresh, { safeDemo: true, onComplete }));

    await page.getByRole("button", { name: "Refresh archive" }).click();
    const credential = page.getByLabelText("Demo credential");

    await expect
      .element(page.getByText(/cannot accept or send a real PlayStation token/))
      .toBeVisible();
    await expect.element(credential).toHaveValue("PLAYLOOM-DEMO");
    await expect.element(credential).toHaveAttribute("readonly", "");

    await page.getByRole("button", { name: "Preview rejected credential" }).click();

    await expect.element(page.getByText(/demo credential was rejected/)).toBeVisible();
    await expect.element(page.getByText(/saved archive is unchanged/)).toBeVisible();
    await expect.element(credential).toHaveValue("PLAYLOOM-DEMO");

    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    expect(onRefresh).toHaveBeenCalledExactlyOnceWith("playloom-demo-credential");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps progress focused and locks the refresh context until completion", async () => {
    let completeRefresh: () => void = () => undefined;
    const pendingRefresh = new Promise<void>((resolve) => {
      completeRefresh = resolve;
    });
    const onRefresh = vi.fn(() => pendingRefresh);
    await render(view(onRefresh));

    const trigger = page.getByRole("button", { name: "Refresh archive" });
    await trigger.click();
    const token = page.getByLabelText("npsso token");
    await token.fill("fresh-token");
    await page.getByRole("button", { name: "Refresh PlayStation archive" }).click();

    const progress = page.getByRole("status", { name: "Refresh progress" });

    await expect.element(progress).toHaveFocus();
    await expect.element(page.getByText(/saved archive stays available/)).toBeVisible();
    await expect.element(token).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Close" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Refresh PlayStation archive" }))
      .toBeDisabled();

    await userEvent.keyboard("{Escape}");

    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .toBeVisible();
    await expect.element(token).toHaveValue("fresh-token");

    completeRefresh();

    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it.each([
    [1440, 900],
    [390, 844],
  ])("restores focus after dismissal at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));
    await render(view(vi.fn()));

    const trigger = page.getByRole("button", { name: "Refresh archive" });
    await trigger.click();

    await userEvent.keyboard("{Escape}");

    await expect
      .element(page.getByRole("heading", { name: "Refresh PlayStation archive" }))
      .not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  it("matches the mobile footer's reading and visual order", async () => {
    await page.viewport(390, 844);
    onTestFinished(() => page.viewport(1280, 800));
    await render(view(vi.fn()));

    await page.getByRole("button", { name: "Refresh archive" }).click();
    const cancel = page.getByRole("button", { name: "Cancel" }).element();
    const submit = page.getByRole("button", { name: "Refresh PlayStation archive" }).element();

    expect(cancel.nextElementSibling).toBe(submit);
    expect(cancel.getBoundingClientRect().top).toBeLessThan(submit.getBoundingClientRect().top);
  });

  it("keeps every refresh sheet control at least 44 pixels high", async () => {
    await render(view(vi.fn(), { safeDemo: true }));

    await page.getByRole("button", { name: "Refresh archive" }).click();

    const preview = page.getByRole("button", { name: "Preview rejected credential" }).element();
    const close = page.getByRole("button", { name: "Close" }).element();
    const cancel = page.getByRole("button", { name: "Cancel" }).element();
    const submit = page.getByRole("button", { name: "Refresh PlayStation archive" }).element();

    expect(preview.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(cancel.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(submit.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});
