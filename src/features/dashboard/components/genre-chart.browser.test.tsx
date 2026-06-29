import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { genreBreakdown } from "@/features/dashboard/analytics";
import { GenreChart } from "./charts";

test("genre donut tooltip shows the genre name on hover", async () => {
  // Tailwind CSS isn't loaded in the browser test, so the chart's `h-[300px]`
  // class resolves to height 0 and Recharts renders nothing — give it a size.
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>[data-slot="chart"]{width:300px;height:300px}</style>`
  );

  const topSlice = genreBreakdown(demoDashboard)[0];
  if (!topSlice) throw new Error("expected at least one genre slice");
  const topGenre = topSlice.genre;
  const { container } = await render(<GenreChart data={demoDashboard} />);

  await expect.poll(() => container.querySelector(".recharts-sector")).not.toBeNull();
  const sector = container.querySelector(".recharts-sector");
  if (!sector) throw new Error("expected a pie sector to render");
  // Recharts wires the tooltip to the sector's mouse-enter handler; dispatch it
  // directly to avoid fighting the slice's entrance animation.
  sector.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

  // The genre and "lifetime hours" also appear in the hidden table, so scope to the donut.
  const donut = page.getByRole("img");
  await expect.element(donut.getByText(topGenre)).toBeInTheDocument();
  await expect.element(donut.getByText(/lifetime hours ·/)).toBeInTheDocument();
});

test("names the donut with each genre's share and hours as its text equivalent", async () => {
  const slices = genreBreakdown(demoDashboard);
  const expected = `Genre share of lifetime hours: ${slices
    .map((s) => `${s.genre} ${s.hours.toLocaleString()} hours, ${s.share}%`)
    .join(", ")}.`;

  const { container } = await render(<GenreChart data={demoDashboard} />);

  const chart = container.querySelector('[role="img"]');
  if (!chart) throw new Error("expected the genre donut to expose role=img");

  expect(chart).toHaveAttribute("aria-label", expected);
});

test("exposes a visually-hidden data table covering every genre slice", async () => {
  const slices = genreBreakdown(demoDashboard);
  const topSlice = slices[0];
  if (!topSlice) throw new Error("expected at least one genre slice");

  const { container } = await render(<GenreChart data={demoDashboard} />);

  const table = container.querySelector("table.sr-only");
  if (!table) throw new Error("expected a visually-hidden genre data table");

  expect(table.querySelectorAll("tbody tr")).toHaveLength(slices.length);

  await expect.element(page.getByRole("rowheader", { name: topSlice.genre })).toBeInTheDocument();
});
