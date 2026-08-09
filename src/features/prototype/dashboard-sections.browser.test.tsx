import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { HistoryViews } from "./dashboard-sections";

describe("HistoryViews", () => {
  it("shows and describes Sessions in displayed average-session order", async () => {
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

    await render(<HistoryViews data={data} />);

    const sessions = page.getByRole("region", { name: "Sessions" });
    const chart = sessions.getByRole("img");
    const most = chart.getByText("Most", { exact: true }).element();
    const alpha = chart.getByText("Alpha", { exact: true }).element();
    const gamma = chart.getByText("Gamma", { exact: true }).element();
    const short = chart.getByText("Short", { exact: true }).element();

    expect(most.getBoundingClientRect().top).toBeLessThan(alpha.getBoundingClientRect().top);
    expect(alpha.getBoundingClientRect().top).toBeLessThan(gamma.getBoundingClientRect().top);
    expect(gamma.getBoundingClientRect().top).toBeLessThan(short.getBoundingClientRect().top);
    await expect
      .element(chart)
      .toHaveAttribute(
        "aria-label",
        "Average session length per game: Most 10 hours per session across 10 sessions, Alpha 10 hours per session across 8 sessions, Gamma 10 hours per session across 8 sessions, Short 2 hours per session across 60 sessions."
      );
  });
});
