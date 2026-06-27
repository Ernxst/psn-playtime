import { beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { FranchiseChart, SessionChart, TopGamesChart, YearChart } from "./charts";

// Tailwind isn't loaded in browser tests, so the chart height classes resolve
// to 0 and Recharts renders nothing — give every chart surface a real size.
beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>[data-slot="chart"]{width:400px;height:360px}</style>`
  );
});

test("top-games chart plots a bar for each of the most-played titles", async () => {
  const { container } = await render(<TopGamesChart data={demoDashboard} />);

  await expect.element(page.getByText("1,254h")).toBeInTheDocument();
  await expect.poll(() => container.querySelectorAll(".recharts-bar-rectangle").length).toBe(10);
});

test("franchise chart labels each series along the category axis", async () => {
  await render(<FranchiseChart data={demoDashboard} />);

  await expect.element(page.getByText("Call of Duty").first()).toBeInTheDocument();
});

test("year chart plots an area keyed by most-recent-play year", async () => {
  const { container } = await render(<YearChart data={demoDashboard} />);

  await expect.element(page.getByText("2026")).toBeInTheDocument();
  await expect.poll(() => container.querySelector(".recharts-area-area")).not.toBeNull();
});

test("session chart plots a bar per title with a sessions axis", async () => {
  const { container } = await render(<SessionChart data={demoDashboard} />);

  await expect.poll(() => container.querySelectorAll(".recharts-bar-rectangle").length).toBe(12);
});
