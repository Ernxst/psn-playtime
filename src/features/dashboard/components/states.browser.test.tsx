import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { DashboardEmpty, DashboardError, DashboardNoMatches, DashboardSkeleton } from "./states";

describe("DashboardSkeleton", () => {
  it("skeleton renders placeholder blocks while the dashboard loads", async () => {
    const { container } = await render(<DashboardSkeleton />);

    // Skeleton count is an intentional loading-layout structure contract.
    // oxlint-disable-next-line test-contract/no-dom-selector
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(12);
  });
});

describe("DashboardError", () => {
  it("error state shows the message and triggers the retry callback when clicked", async () => {
    const onRetry = vi.fn();

    await render(<DashboardError message="Token expired" onRetry={onRetry} />);

    await expect.element(page.getByText("Couldn't load your data")).toBeVisible();
    await expect.element(page.getByText("Token expired")).toBeVisible();

    await page.getByRole("button", { name: "Try again" }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error state omits the retry button when no callback is supplied", async () => {
    await render(<DashboardError message="No retry here" />);

    await expect.element(page.getByText("No retry here")).toBeVisible();
    expect(page.getByRole("button", { name: "Try again" }).query()).toBeNull();
  });
});

describe("DashboardEmpty", () => {
  it("empty state explains that no played titles were found", async () => {
    await render(<DashboardEmpty />);

    await expect.element(page.getByText("No games yet")).toBeVisible();
  });
});

describe("DashboardNoMatches", () => {
  it("no-matches state clears the filters when the button is clicked", async () => {
    const onClear = vi.fn();

    await render(<DashboardNoMatches onClear={onClear} />);

    await expect.element(page.getByText("No games match your filters")).toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
