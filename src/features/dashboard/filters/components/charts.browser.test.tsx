import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";
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
    await expect
      .element(
        page.getByText(
          "These are lifetime hours. A last-played timeframe changes which games appear, not the hours counted for each game."
        )
      )
      .toBeVisible();
    // Recharts exposes no semantic locator for its generated bar primitives.
    // oxlint-disable-next-line test-contract/no-dom-selector
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
    // Recharts exposes no semantic locator for its generated area path.
    // oxlint-disable-next-line test-contract/no-dom-selector
    await expect.poll(() => container.querySelector(".recharts-area-area")).not.toBeNull();
  });
});

describe("SessionChart", () => {
  it("session chart plots a bar per title with a sessions axis", async () => {
    const { container } = await render(<SessionChart data={demoDashboard} />);

    // Recharts exposes no semantic locator for its generated bar primitives.
    // oxlint-disable-next-line test-contract/no-dom-selector
    await expect.poll(() => container.querySelectorAll(".recharts-bar-rectangle").length).toBe(12);
  });

  it("orders visible and accessible rows by session length with deterministic ties", async () => {
    const data: DashboardData = {
      ...demoDashboard,
      games: [
        {
          ...demoDashboard.games[0]!,
          titleId: "SHORT",
          name: "Short",
          hours: 120,
          playCount: 60,
        },
        {
          ...demoDashboard.games[1]!,
          titleId: "MOST",
          name: "Most",
          hours: 100,
          playCount: 10,
        },
        {
          ...demoDashboard.games[2]!,
          titleId: "GAMMA",
          name: "Gamma",
          hours: 80,
          playCount: 8,
        },
        {
          ...demoDashboard.games[3]!,
          titleId: "ALPHA",
          name: "Alpha",
          hours: 80,
          playCount: 8,
        },
      ],
    };

    await render(<SessionChart data={data} />);

    const most = page.getByText("Most", { exact: true }).last().element();
    const alpha = page.getByText("Alpha", { exact: true }).last().element();
    const gamma = page.getByText("Gamma", { exact: true }).last().element();
    const short = page.getByText("Short", { exact: true }).last().element();

    expect(most.getBoundingClientRect().top).toBeLessThan(alpha.getBoundingClientRect().top);
    expect(alpha.getBoundingClientRect().top).toBeLessThan(gamma.getBoundingClientRect().top);
    expect(gamma.getBoundingClientRect().top).toBeLessThan(short.getBoundingClientRect().top);
    expect(page.getByRole("img").element()).toHaveAttribute(
      "aria-label",
      "Average session length per game: Most 10 hours per session across 10 sessions, Alpha 10 hours per session across 8 sessions, Gamma 10 hours per session across 8 sessions, Short 2 hours per session across 60 sessions."
    );
  });
});

describe("chart accessible names", () => {
  it.each(named)(
    "exposes $prefix chart as an image queryable by its accessible name",
    async ({ Chart, prefix }) => {
      await render(<Chart data={demoDashboard} />);

      const chart = page.getByRole("img").element();

      expect(chart).toHaveAttribute(
        "aria-label",
        expect.stringMatching(new RegExp(`^${prefix} .+\\.$`))
      );
    }
  );
});
