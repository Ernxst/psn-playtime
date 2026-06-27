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
