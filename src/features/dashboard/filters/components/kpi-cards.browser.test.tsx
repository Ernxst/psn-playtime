import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { KpiCards } from "./kpi-cards";

describe("KpiCards", () => {
  it("contains exactly the three first-impression measures", async () => {
    await render(<KpiCards data={demoDashboard} />);

    await expect.element(page.getByText("Lifetime play time")).toBeVisible();
    await expect.element(page.getByText("Games played")).toBeVisible();
    await expect.element(page.getByText("Launches", { exact: true })).toBeVisible();
    await expect
      .element(page.getByText(/Trophy level|Biggest game|That's roughly/))
      .not.toBeInTheDocument();
  });

  it("folds duration and excluded app time beneath lifetime play time", async () => {
    await render(<KpiCards data={demoDashboard} />);

    await expect.element(page.getByText(/About .* in total/)).toBeVisible();
    await expect.element(page.getByText(/streaming and app time is excluded/)).toBeVisible();
    await expect.element(page.getByText(/All playtime is PSN-recorded hours/)).toBeVisible();
  });

  it("reframes filtered hours without implying hours within the period", async () => {
    await render(<KpiCards data={demoDashboard} timeframePhrase="the last 12 months" />);

    await expect.element(page.getByText("Lifetime hours (filtered)")).toBeVisible();
    await expect
      .element(page.getByText("Games last played in the last 12 months; still lifetime hours."))
      .toBeVisible();
  });
});
