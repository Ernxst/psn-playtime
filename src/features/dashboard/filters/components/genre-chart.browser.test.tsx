import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { genreBreakdown } from "@/features/dashboard/filters/analytics";
import * as Dashboard from "@/test/factories/dashboard";
import { GenreChart } from "./charts";

describe("GenreChart", () => {
  it("shows a genre's formatted lifetime hours and share when the donut is hovered", async () => {
    const dashboard = Dashboard.data({
      games: [
        { ...Dashboard.data().games[0]!, genre: "Shooter", hours: 1_234 },
        { ...Dashboard.data().games[1]!, genre: "RPG", hours: 766 },
      ],
      meta: { totalHours: 2_000 },
    });
    const [hovered] = genreBreakdown(dashboard);
    await render(<GenreChart data={dashboard} />);

    const donut = page.getByRole("img");
    await donut.hover({ position: { x: 250, y: 150 } });

    await expect.element(donut.getByText(hovered!.genre, { exact: true })).toBeInTheDocument();
    await expect
      .element(
        donut.getByText(`${hovered!.hours.toLocaleString()} lifetime hours · ${hovered!.share}%`, {
          exact: true,
        })
      )
      .toBeInTheDocument();
  });

  it("names the donut with each genre's share and hours as its text equivalent", async () => {
    const slices = genreBreakdown(Dashboard.data());
    const expected = `Genre share of lifetime hours: ${slices
      .map((s) => `${s.genre} ${s.hours.toLocaleString()} hours, ${s.share}%`)
      .join(", ")}.`;

    await render(<GenreChart data={Dashboard.data()} />);

    await expect.element(page.getByRole("img")).toHaveAttribute("aria-label", expected);
  });

  it("exposes a visually-hidden data table covering every genre slice", async () => {
    const slices = genreBreakdown(Dashboard.data());
    await render(<GenreChart data={Dashboard.data()} />);

    await expect.element(page.getByRole("row").nth(slices.length)).toBeInTheDocument();
    await expect.element(page.getByRole("row").nth(slices.length + 1)).not.toBeInTheDocument();

    await expect.element(page.getByRole("rowheader", { name: "Shooter" })).toBeInTheDocument();
  });
});
