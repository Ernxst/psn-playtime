import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LIFETIME_HOURS_CAVEAT } from "@/features/dashboard/filters/analytics";
import * as Dashboard from "@/test/factories/dashboard";
import { KpiCards } from "./kpi-cards";

describe("KpiCards", () => {
  it("surfaces the headline trophy level and biggest game from the data", async () => {
    await render(<KpiCards data={Dashboard.data()} />);

    await expect.element(page.getByText("220")).toBeInTheDocument();
    await expect.element(page.getByText("Call of Duty®: Modern Warfare®")).toBeInTheDocument();
  });

  it("falls back to a placeholder when the library has no biggest game", async () => {
    const empty = {
      ...Dashboard.data(),
      games: [],
      meta: { ...Dashboard.data().meta, totalGames: 0 },
    };

    await render(<KpiCards data={empty} />);

    await expect.element(page.getByText("Biggest game")).toBeVisible();
    await expect.element(page.getByText("—", { exact: true })).toBeVisible();
  });

  it("labels the headline hours as a lifetime total with a persistent disclaimer", async () => {
    await render(<KpiCards data={Dashboard.data()} />);

    await expect.element(page.getByText("Lifetime play time")).toBeVisible();
    await expect.element(page.getByText(/All playtime is PSN-recorded hours/)).toBeVisible();
  });

  it("exposes the lifetime caveat as an accessible tooltip on the headline figures", async () => {
    await render(
      <TooltipProvider delay={0}>
        <KpiCards data={Dashboard.data()} />
      </TooltipProvider>
    );

    await page.getByRole("button").first().hover();

    await expect.element(page.getByText(LIFETIME_HOURS_CAVEAT, { exact: true })).toBeVisible();
  });

  it("reframes the headline as games-last-played when a timeframe is active", async () => {
    await render(<KpiCards data={Dashboard.data()} timeframePhrase="the last 12 months" />);

    await expect.element(page.getByText("Lifetime hours (filtered)")).toBeVisible();
    await expect.element(page.getByText(/games last played in the last 12 months/)).toBeVisible();
  });
});
