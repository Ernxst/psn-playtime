import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { GenresFranchisesSection, TimelineSection, TopGamesSection } from "./chart-sections";

describe("TopGamesSection", () => {
  it("frames the top games chart with its title and caption", async () => {
    await render(<TopGamesSection data={demoDashboard} />);

    await expect.element(page.getByText("Top games by hours")).toBeVisible();
    await expect
      .element(page.getByText("The titles you've sunk the most lifetime hours into."))
      .toBeVisible();
  });

  it("forwards the dashboard data to the top games chart", async () => {
    await render(<TopGamesSection data={demoDashboard} />);

    await expect
      .element(page.getByRole("img", { name: /Top games by lifetime hours/ }))
      .toHaveAccessibleName(/Call of Duty®: Modern Warfare®/);
  });

  it("renders an empty top games chart when the library has no games", async () => {
    const empty = { ...demoDashboard, games: [] };

    await render(<TopGamesSection data={empty} />);

    expect(page.getByRole("img", { name: /Call of Duty/ }).query()).toBeNull();
    await expect
      .element(page.getByRole("img", { name: /Top games by lifetime hours/ }))
      .toBeInTheDocument();
  });
});

describe("GenresFranchisesSection", () => {
  it("lays out the genre and franchise cards side by side", async () => {
    await render(<GenresFranchisesSection data={demoDashboard} />);

    await expect.element(page.getByText("What kind of player are you?")).toBeVisible();
    await expect.element(page.getByText("Share of your lifetime hours by genre.")).toBeVisible();
    await expect.element(page.getByText("Favourite franchises")).toBeVisible();
    await expect
      .element(page.getByText("Series you keep coming back to, by total lifetime hours."))
      .toBeVisible();
  });

  it("forwards the dashboard data to the genre and franchise charts", async () => {
    await render(<GenresFranchisesSection data={demoDashboard} />);

    await expect
      .element(page.getByRole("img", { name: /Genre share of lifetime hours/ }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("img", { name: /Top franchises by lifetime hours/ }))
      .toBeInTheDocument();
  });
});

describe("TimelineSection", () => {
  it("lays out the year and session cards side by side", async () => {
    await render(<TimelineSection data={demoDashboard} />);

    await expect.element(page.getByText("Hours by most-recent year")).toBeVisible();
    await expect.element(page.getByText("Binge or dip-in?")).toBeVisible();
  });

  it("forwards the dashboard data to the year and session charts", async () => {
    await render(<TimelineSection data={demoDashboard} />);

    await expect
      .element(page.getByRole("img", { name: /Lifetime hours by most-recent-play year/ }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("img", { name: /Average session length per game/ }))
      .toBeInTheDocument();
  });
});
