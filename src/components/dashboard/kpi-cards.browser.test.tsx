import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { KpiCards } from "./kpi-cards";

test("surfaces the headline trophy level and biggest game from the data", async () => {
  await render(<KpiCards data={demoDashboard} />);

  await expect.element(page.getByText("220")).toBeInTheDocument();
  await expect.element(page.getByText("Call of Duty®: Modern Warfare®")).toBeInTheDocument();
});

test("falls back to a placeholder when the library has no biggest game", async () => {
  const empty = { ...demoDashboard, games: [], meta: { ...demoDashboard.meta, totalGames: 0 } };

  await render(<KpiCards data={empty} />);

  await expect.element(page.getByText("Biggest game")).toBeVisible();
  await expect.element(page.getByText("—")).toBeVisible();
});

test("labels the headline hours as a lifetime total with a persistent disclaimer", async () => {
  await render(<KpiCards data={demoDashboard} />);

  await expect.element(page.getByText("Lifetime play time")).toBeVisible();
  await expect.element(page.getByText(/All playtime is PSN-recorded hours/)).toBeVisible();
});

test("exposes the lifetime caveat as an accessible tooltip on the headline figures", async () => {
  await render(<KpiCards data={demoDashboard} />);

  await page.getByRole("button").first().hover();

  await expect
    .element(page.getByText(/PSN can under-report or miss play time for some titles/))
    .toBeVisible();
});

test("reframes the headline as games-last-played when a timeframe is active", async () => {
  await render(<KpiCards data={demoDashboard} timeframePhrase="the last 12 months" />);

  await expect.element(page.getByText("Lifetime hours (filtered)")).toBeVisible();
  await expect.element(page.getByText(/games last played in the last 12 months/)).toBeVisible();
});
