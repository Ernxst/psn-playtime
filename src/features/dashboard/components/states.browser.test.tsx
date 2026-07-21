import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { createHarness } from "@/test/harness";
import {
  DashboardEmpty,
  DashboardError,
  DashboardNoMatches,
  DashboardPartialNotice,
  DashboardSkeleton,
} from "./states";

describe("DashboardSkeleton", () => {
  it("keeps the Playloom shell and exposes a busy loading status", async () => {
    const { element } = createHarness(<DashboardSkeleton profile={demoDashboard.profile} />);
    const { container } = await render(element);

    // Skeleton count is an intentional loading-layout structure contract.
    // oxlint-disable-next-line test-contract/no-dom-selector
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(12);
    await expect.element(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading PlayStation archive");
    await expect.element(page.getByText("Deterministic demo data")).toBeVisible();
    expect(
      container.querySelectorAll('[data-slot="dashboard-shell-header"] [data-slot="skeleton"]')
        .length
    ).toBe(3);
    expect(
      container
        .querySelector<HTMLElement>('[data-slot="dashboard-shell-header"]')
        ?.getBoundingClientRect().height
    ).toBe(60);
    await expect
      .element(page.getByRole("link", { name: "Playloom — go to home page" }))
      .toBeVisible();
  });
});

describe("DashboardError", () => {
  it("keeps the shell and offers contextual recovery", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(1280, 800));
    const onRetry = vi.fn();
    const profile = {
      ...demoDashboard.profile,
      onlineId: "ActiveArchive",
      sourceLabel: "Imported from PlayStation",
    };
    const { element } = createHarness(
      <DashboardError message="Token expired" onRetry={onRetry} profile={profile} />
    );
    const { container } = await render(element);

    expect(container.querySelectorAll("main").length).toBe(1);
    await expect.element(page.getByText("Couldn't load this archive")).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Couldn't load this archive" }))
      .toHaveFocus();
    await expect.element(page.getByText("ActiveArchive").first()).toBeVisible();
    await expect.element(page.getByText("Imported from PlayStation").first()).toBeVisible();
    await expect.element(page.getByText("Your saved browser data is unchanged.")).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Try again" }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits retry when no retry callback is supplied", async () => {
    const { element } = createHarness(<DashboardError message="No retry here" />);

    await render(element);

    await expect.element(page.getByText("No retry here")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("DashboardEmpty", () => {
  it("explains disabled filters and keeps existing recovery paths", async () => {
    const { element } = createHarness(<DashboardEmpty />);

    await render(element);

    await expect.element(page.getByText("No PlayStation games found")).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Connect PlayStation" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Restore an archive" })).toBeVisible();
  });
});

describe("DashboardPartialNotice", () => {
  it("distinguishes every unavailable partial-data category without inventing values", async () => {
    await render(<DashboardPartialNotice />);

    await expect.element(page.getByText("This archive has partial PlayStation data")).toBeVisible();
    await expect
      .element(page.getByText(/Sessions, franchises, trophies, artwork enrichment/))
      .toBeVisible();
    await expect.element(page.getByText(/purchase transactions are unavailable/)).toBeVisible();
  });
});

describe("DashboardNoMatches", () => {
  it("announces no matches and clears the filters", async () => {
    const onClear = vi.fn();

    await render(<DashboardNoMatches onClear={onClear} />);

    await expect
      .element(page.getByRole("heading", { name: "No games match your filters" }))
      .toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
