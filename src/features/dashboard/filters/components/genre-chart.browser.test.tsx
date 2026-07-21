import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { genreBreakdown } from "@/features/dashboard/filters/analytics";
import { GenreChart } from "./charts";

describe("GenreChart", () => {
  it("genre donut tooltip shows the genre name on hover", async () => {
    const { container } = await render(<GenreChart data={demoDashboard} />);

    // Recharts exposes no semantic locator for its generated sector path.
    // oxlint-disable-next-line test-contract/no-dom-selector
    await expect.poll(() => container.querySelector(".recharts-sector")).not.toBeNull();

    // Recharts exposes no semantic locator for its generated sector path.
    // oxlint-disable-next-line test-contract/no-dom-selector
    const sector = container.querySelector(".recharts-sector");

    expect(sector).toBeInstanceOf(SVGElement);

    // The animated path is repeatedly replaced and its SVG parent intercepts
    // pointer events, so userEvent.hover cannot reach it reliably.
    sector!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    // The genre and "lifetime hours" also appear in the hidden table, so scope to the donut.
    const donut = page.getByRole("img");

    await expect.element(donut.getByText("Shooter")).toBeInTheDocument();
    await expect.element(donut.getByText(/lifetime hours ·/)).toBeInTheDocument();
  });

  it("names the donut with each genre's share and hours as its text equivalent", async () => {
    const slices = genreBreakdown(demoDashboard);
    const expected = `Genre share of lifetime hours: ${slices
      .map((s) => `${s.genre} ${s.hours.toLocaleString()} hours, ${s.share}%`)
      .join(", ")}.`;

    await render(<GenreChart data={demoDashboard} />);

    await expect.element(page.getByRole("img")).toHaveAttribute("aria-label", expected);
  });

  it("exposes a visually-hidden data table covering every genre slice", async () => {
    const slices = genreBreakdown(demoDashboard);
    await render(<GenreChart data={demoDashboard} />);

    await expect.element(page.getByRole("row").nth(slices.length)).toBeInTheDocument();
    await expect.element(page.getByRole("row").nth(slices.length + 1)).not.toBeInTheDocument();

    await expect.element(page.getByRole("rowheader", { name: "Shooter" })).toBeInTheDocument();
  });
});
