import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { type DashboardFilters, defaultFilters } from "@/features/dashboard/filters/analytics";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import { FilterBar } from "./filter-bar";

// FilterBar is a controlled component; this drives it the way DashboardView does
// so facet toggles actually update the live filter state.
function ControlledFilterBar({ data = Dashboard.data() }: { data?: DashboardData }) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return <FilterBar data={data} filters={filters} onChange={setFilters} />;
}

const trophy: NonNullable<GamePlay["trophy"]> = {
  progress: 80,
  earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
  total: 10,
  hasPlatinum: true,
  lastEarnedAt: "2024-01-01",
};

function withTrophies(): DashboardData {
  const data = Dashboard.data();
  return Dashboard.data({
    games: data.games.map((game, index) => (index === 0 ? { ...game, trophy } : game)),
  });
}

describe("FilterBar", () => {
  it("opens the filter popover and reveals the facet controls when the trigger is clicked", async () => {
    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={() => {}} />
    );

    await expect.element(page.getByText("Genre")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByText("Genre")).toBeInTheDocument();
    await expect.element(page.getByText("Platform")).toBeInTheDocument();
  });

  it("typing in the search box reports the query to the parent", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("halo");

    expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, search: "halo" });
  });

  it("ticking a genre facet adds it to the selected filters", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByText("Shooter").click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, genres: ["Shooter"] });
  });

  it("toggling an activity tab maps the choice back through the parent", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("tab", { name: "Dormant" }).click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, activity: "dormant" });
  });

  it("editing the last-played date floor reports the bound to the parent", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabelText("Last played from").fill("2024-01-01");

    expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, lastPlayedFrom: "2024-01-01" });
  });

  it("nudging the hours range slider reports a non-zero lower bound", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByText(/Hours:/)).toBeVisible();

    page.getByRole("slider").nth(0).element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, minHours: 1 });
  });

  it("nudging the min-sessions slider reports a non-zero floor", async () => {
    const onChange = vi.fn();

    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={onChange} />
    );

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByText(/Min sessions:/)).toBeVisible();

    page.getByRole("slider").nth(2).element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, minSessions: 1 });
  });

  it("the hours range slider names its two thumbs Minimum and Maximum hours", async () => {
    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={() => {}} />
    );

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByRole("slider", { name: "Minimum hours" })).toBeInTheDocument();
    await expect.element(page.getByRole("slider", { name: "Maximum hours" })).toBeInTheDocument();
  });

  it("the min-sessions slider names its thumb Minimum sessions", async () => {
    await render(
      <FilterBar data={Dashboard.data()} filters={defaultFilters} onChange={() => {}} />
    );

    await page.getByRole("button", { name: "Filters" }).click();

    await expect
      .element(page.getByRole("slider", { name: "Minimum sessions" }))
      .toBeInTheDocument();
  });

  it("the min-progress trophy slider names its thumb Minimum trophy progress", async () => {
    await render(<FilterBar data={withTrophies()} filters={defaultFilters} onChange={() => {}} />);

    await page.getByRole("button", { name: "Filters" }).click();

    await expect
      .element(page.getByRole("slider", { name: "Minimum trophy progress" }))
      .toBeInTheDocument();
  });

  it("the trophy facet appears only when the library has trophy data", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={withTrophies()} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByText("Has a platinum").click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, hasPlatinum: true });
  });

  it("the min-progress trophy slider reports a non-zero threshold", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={withTrophies()} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByText(/Min progress:/)).toBeVisible();

    page.getByRole("slider").last().element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, minTrophyProgress: 1 });
  });

  it("selections persist across facets and reveal the clear-all control", async () => {
    await render(<ControlledFilterBar data={withTrophies()} />);

    await page.getByRole("button", { name: "Filters" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    await page.getByText("Shooter").click();
    await page.getByText("PS5").click();
    await page.getByText("Has a platinum").click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).toBeVisible();

    await page.getByRole("button", { name: "Clear all" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("shows the active-filter count and clears every filter on demand", async () => {
    const onChange = vi.fn();
    const active = { ...defaultFilters, genres: ["Shooter" as const], search: "halo" };

    await render(<FilterBar data={Dashboard.data()} filters={active} onChange={onChange} />);

    await expect.element(page.getByText("2")).toBeVisible();

    await page.getByRole("button", { name: "Clear all" }).click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith(defaultFilters);
  });
});
