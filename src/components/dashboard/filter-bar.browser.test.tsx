import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { type DashboardFilters, defaultFilters } from "@/lib/psn/analytics";
import { demoDashboard } from "@/lib/psn/mock";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { FilterBar } from "./filter-bar";

// FilterBar is a controlled component; this drives it the way DashboardView does
// so facet toggles actually update the live filter state.
function ControlledFilterBar({ data = demoDashboard }: { data?: typeof demoDashboard }) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return <FilterBar data={data} filters={filters} onChange={setFilters} />;
}

// Tailwind isn't loaded, so the slider parts collapse to 0px and become
// unclickable — give them a real size so the thumbs are focusable.
beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>
      [data-slot="slider-control"]{width:160px;height:16px}
      [data-slot="slider-track"]{width:160px;height:4px}
      [data-slot="slider-thumb"]{display:block;width:16px;height:16px}
    </style>`
  );
});

const trophy: NonNullable<GamePlay["trophy"]> = {
  progress: 80,
  earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
  total: 10,
  hasPlatinum: true,
  lastEarnedAt: "2024-01-01",
};

const withTrophies = {
  ...demoDashboard,
  games: demoDashboard.games.map((g, i) => (i === 0 ? { ...g, trophy } : g)),
};

test("opens the filter popover and reveals the facet controls when the trigger is clicked", async () => {
  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

  expect(page.getByText("Genre").query()).toBeNull();

  await page.getByRole("button", { name: "Filters" }).click();

  await expect.element(page.getByText("Genre")).toBeInTheDocument();
  await expect.element(page.getByText("Platform")).toBeInTheDocument();
});

test("typing in the search box reports the query to the parent", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("searchbox", { name: "Search games by name" }).fill("halo");

  expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, search: "halo" });
});

test("ticking a genre facet adds it to the selected filters", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByText("Shooter").click();

  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, genres: ["Shooter"] });
});

test("toggling an activity tab maps the choice back through the parent", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("tab", { name: "Dormant" }).click();

  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, activity: "dormant" });
});

test("editing the last-played date floor reports the bound to the parent", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabelText("Last played from").fill("2024-01-01");

  expect(onChange).toHaveBeenLastCalledWith({ ...defaultFilters, lastPlayedFrom: "2024-01-01" });
});

test("nudging the hours range slider reports a non-zero lower bound", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await expect.element(page.getByText(/Hours:/)).toBeVisible();
  page.getByRole("slider").nth(0).element().focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minHours: 1 }));
});

test("nudging the min-sessions slider reports a non-zero floor", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await expect.element(page.getByText(/Min sessions:/)).toBeVisible();
  page.getByRole("slider").nth(2).element().focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minSessions: 1 }));
});

test("the hours range slider names its two thumbs Minimum and Maximum hours", async () => {
  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

  await page.getByRole("button", { name: "Filters" }).click();

  await expect.element(page.getByRole("slider", { name: "Minimum hours" })).toBeInTheDocument();
  await expect.element(page.getByRole("slider", { name: "Maximum hours" })).toBeInTheDocument();
});

test("the min-sessions slider names its thumb Minimum sessions", async () => {
  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

  await page.getByRole("button", { name: "Filters" }).click();

  await expect.element(page.getByRole("slider", { name: "Minimum sessions" })).toBeInTheDocument();
});

test("the min-progress trophy slider names its thumb Minimum trophy progress", async () => {
  await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={() => {}} />);

  await page.getByRole("button", { name: "Filters" }).click();

  await expect
    .element(page.getByRole("slider", { name: "Minimum trophy progress" }))
    .toBeInTheDocument();
});

test("the trophy facet appears only when the library has trophy data", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByText("Has a platinum").click();

  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, hasPlatinum: true });
});

test("the min-progress trophy slider reports a non-zero threshold", async () => {
  const onChange = vi.fn();

  await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

  await page.getByRole("button", { name: "Filters" }).click();
  await expect.element(page.getByText(/Min progress:/)).toBeVisible();
  page.getByRole("slider").last().element().focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minTrophyProgress: 1 }));
});

test("selections persist across facets and reveal the clear-all control", async () => {
  await render(<ControlledFilterBar data={withTrophies} />);

  await page.getByRole("button", { name: "Filters" }).click();
  expect(page.getByRole("button", { name: "Clear all" }).query()).toBeNull();

  await page.getByText("Shooter").click();
  await page.getByText("PS5").click();
  await page.getByText("Has a platinum").click();

  await expect.element(page.getByRole("button", { name: "Clear all" })).toBeVisible();

  await page.getByRole("button", { name: "Clear all" }).click();

  expect(page.getByRole("button", { name: "Clear all" }).query()).toBeNull();
});

test("shows the active-filter count and clears every filter on demand", async () => {
  const onChange = vi.fn();
  const active = { ...defaultFilters, genres: ["Shooter" as const], search: "halo" };

  await render(<FilterBar data={demoDashboard} filters={active} onChange={onChange} />);

  await expect.element(page.getByText("2")).toBeVisible();

  await page.getByRole("button", { name: "Clear all" }).click();

  expect(onChange).toHaveBeenCalledExactlyOnceWith(defaultFilters);
});
