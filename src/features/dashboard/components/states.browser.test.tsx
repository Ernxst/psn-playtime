import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
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
    const { element } = createHarness(<DashboardSkeleton />);
    const { container } = await render(element);

    // Skeleton count is an intentional loading-layout structure contract.
    // oxlint-disable-next-line test-contract/no-dom-selector
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(12);
    await expect.element(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading PlayStation archive");
  });
});

describe("DashboardError", () => {
  it("keeps the shell and offers contextual recovery", async () => {
    const onRetry = vi.fn();
    const { element } = createHarness(<DashboardError message="Token expired" onRetry={onRetry} />);
    const { container } = await render(element);

    expect(container.querySelectorAll("main").length).toBe(1);
    await expect.element(page.getByText("Couldn't load this archive")).toBeVisible();
    await expect.element(page.getByText("Your saved browser data is unchanged.")).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Home" })).toBeVisible();

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
