import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import * as Dashboard from "@/test/factories/dashboard";
import { FranchiseChart, SessionChart, TopGamesChart, YearChart } from "./charts";

const named = [
  { Chart: TopGamesChart, prefix: "Top games by lifetime hours:" },
  { Chart: FranchiseChart, prefix: "Top franchises by lifetime hours:" },
  { Chart: YearChart, prefix: "Lifetime hours by most-recent-play year:" },
  { Chart: SessionChart, prefix: "Average session length per game:" },
] as const;

describe("TopGamesChart", () => {
  it("describes the most-played title and its hours", async () => {
    await render(<TopGamesChart data={Dashboard.data()} />);

    await expect
      .element(page.getByRole("img"))
      .toHaveAttribute(
        "aria-label",
        expect.stringContaining("Call of Duty®: Modern Warfare® 1,254 hours")
      );
  });
});

describe("FranchiseChart", () => {
  it("franchise chart labels each series along the category axis", async () => {
    await render(<FranchiseChart data={Dashboard.data()} />);

    await expect.element(page.getByText("Call of Duty").first()).toBeInTheDocument();
  });
});

describe("YearChart", () => {
  it("describes hours keyed by most-recent-play year", async () => {
    await render(<YearChart data={Dashboard.data()} />);

    await expect
      .element(page.getByRole("img"))
      .toHaveAttribute("aria-label", expect.stringContaining("2026"));
  });
});

describe("SessionChart", () => {
  it("describes average session length per title", async () => {
    await render(<SessionChart data={Dashboard.data()} />);

    await expect
      .element(page.getByRole("img"))
      .toHaveAttribute("aria-label", expect.stringContaining("hours per session"));
  });
});

describe("chart accessible names", () => {
  it.each(named)(
    "exposes $prefix chart as an image queryable by its accessible name",
    async ({ Chart, prefix }) => {
      await render(<Chart data={Dashboard.data()} />);

      const chart = page.getByRole("img").element();

      expect(chart).toHaveAttribute(
        "aria-label",
        expect.stringMatching(new RegExp(`^${prefix} .+\\.$`))
      );
    }
  );
});
