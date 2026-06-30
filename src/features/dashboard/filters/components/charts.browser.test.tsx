import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { FranchiseChart, SessionChart, TopGamesChart, YearChart } from "./charts";

const named = [
  { Chart: TopGamesChart, prefix: "Top games by lifetime hours:" },
  { Chart: FranchiseChart, prefix: "Top franchises by lifetime hours:" },
  { Chart: YearChart, prefix: "Lifetime hours by most-recent-play year:" },
  { Chart: SessionChart, prefix: "Average session length per game:" },
] as const;

describe("TopGamesChart", () => {
  it("top-games chart plots a bar for each of the most-played titles", async () => {
    const { container } = await render(<TopGamesChart data={demoDashboard} />);

    await expect.element(page.getByText("1,254h")).toBeInTheDocument();
    await expect.poll(() => container.querySelectorAll(".recharts-bar-rectangle").length).toBe(10);
  });
});

describe("FranchiseChart", () => {
  it("franchise chart labels each series along the category axis", async () => {
    await render(<FranchiseChart data={demoDashboard} />);

    await expect.element(page.getByText("Call of Duty").first()).toBeInTheDocument();
  });
});

describe("YearChart", () => {
  it("year chart plots an area keyed by most-recent-play year", async () => {
    const { container } = await render(<YearChart data={demoDashboard} />);

    await expect.element(page.getByText("2026")).toBeInTheDocument();
    await expect.poll(() => container.querySelector(".recharts-area-area")).not.toBeNull();
  });
});

describe("SessionChart", () => {
  it("session chart plots a bar per title with a sessions axis", async () => {
    const { container } = await render(<SessionChart data={demoDashboard} />);

    await expect.poll(() => container.querySelectorAll(".recharts-bar-rectangle").length).toBe(12);
  });
});

describe("chart accessible names", () => {
  it.each(named)(
    "exposes $prefix chart as an image queryable by its accessible name",
    async ({ Chart, prefix }) => {
      const { container } = await render(<Chart data={demoDashboard} />);

      const chart = container.querySelector('[role="img"]');
      if (!chart) throw new Error("expected the chart to expose role=img");

      expect(chart).toHaveAttribute(
        "aria-label",
        expect.stringMatching(new RegExp(`^${prefix} .+\\.$`))
      );
    }
  );
});
