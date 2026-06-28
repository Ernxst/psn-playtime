import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { CachedDataIndicator } from "./cached-data-indicator";

const DAY_MS = 24 * 60 * 60 * 1000;

test("shows the relative fetch time for real data", async () => {
  const fetchedAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
  const data = { ...demoDashboard, isDemo: false, fetchedAt };

  await render(<CachedDataIndicator data={data} />);

  await expect.element(page.getByText("Updated 3 days ago")).toBeVisible();
});

test("reveals the cache explanation on hover for real data", async () => {
  const data = { ...demoDashboard, isDemo: false };

  await render(<CachedDataIndicator data={data} />);

  await page.getByRole("button", { name: /Updated/ }).hover();

  await expect.element(page.getByText(/cached in this browser/)).toBeVisible();
});

test("labels demo data instead of showing a fetch time", async () => {
  await render(<CachedDataIndicator data={demoDashboard} />);

  await expect.element(page.getByText("Demo data, not a live PSN pull")).toBeVisible();
  expect(page.getByText(/Updated/).query()).toBeNull();
});
