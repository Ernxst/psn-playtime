import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { type DashboardFilters, defaultFilters } from "@/features/dashboard/filters/analytics";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { FilterBar } from "./filter-bar";

function ControlledFilterBar({ data = demoDashboard }: { data?: typeof demoDashboard }) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return (
    <FilterBar
      data={data}
      filters={filters}
      onChange={setFilters}
      resultCount={data.games.length}
    />
  );
}

const trophy: NonNullable<GamePlay["trophy"]> = {
  progress: 80,
  earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
  total: 10,
  hasPlatinum: true,
  lastEarnedAt: "2024-01-01",
};

const withTrophies = {
  ...demoDashboard,
  games: demoDashboard.games.map((game, index) => (index === 0 ? { ...game, trophy } : game)),
};

describe("FilterBar", () => {
  it("opens a named filter sheet with persistent task controls", async () => {
    await render(<ControlledFilterBar />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();
    await expect.element(page.getByText("Applies to Profile, History and Library")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Clear" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Done filtering" })).toBeVisible();
  });

  it("preserves document scroll and restores trigger focus when the sheet closes", async () => {
    const { container } = await render(
      <div data-test-scroll style={{ height: 200, overflow: "auto" }}>
        <div style={{ minHeight: 1200, paddingTop: 400 }}>
          <ControlledFilterBar />
        </div>
      </div>
    );
    const scroller = container.querySelector<HTMLElement>("[data-test-scroll]");
    if (scroller) scroller.scrollTop = 320;
    expect(scroller?.scrollTop).toBe(320);
    const trigger = page.getByRole("button", { name: "Filter games" });

    await trigger.click();
    await expect.element(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(trigger).toHaveFocus();
    expect(scroller?.scrollTop).toBe(320);
  });

  it("reports search and checkbox changes through the controlled filter model", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("halo");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, search: "halo" });
  });

  it("keeps native dates and exact numeric threshold controls", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByLabelText("Last played from").fill("2024-01-01");
    await page.getByRole("spinbutton", { name: "Minimum hours" }).fill("12");
    await page.getByRole("spinbutton", { name: "Maximum hours" }).fill("300");
    await page.getByRole("spinbutton", { name: "Minimum sessions" }).fill("4");
    await page.getByRole("spinbutton", { name: "Minimum trophy progress" }).fill("75");

    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenLastCalledWith({
      ...defaultFilters,
      minTrophyProgress: 75,
    });
  });

  it("uses radio semantics for the exclusive activity filter", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    const dormant = page.getByRole("radio", { name: "Dormant" });
    await expect.element(dormant).toBeInTheDocument();
    dormant.element().focus();
    await userEvent.keyboard(" ");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, activity: "dormant" });
  });

  it("searches the long franchise facet without changing selected filters", async () => {
    await render(<ControlledFilterBar />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByRole("searchbox", { name: "Search franchises" }).fill("Forza");

    await expect.element(page.getByText(/Forza/).first()).toBeVisible();
    expect(page.getByText("Grand Theft Auto").query()).toBeNull();
  });

  it("nudging the hours range slider reports a non-zero lower bound", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByText(/Hours:/)).toBeVisible();

    page.getByRole("slider").nth(0).element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minHours: 1 }));
  });

  it("nudging the min-sessions slider reports a non-zero floor", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByText(/Min sessions:/)).toBeVisible();

    page.getByRole("slider").nth(2).element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minSessions: 1 }));
  });

  it("the hours range slider names its two thumbs Minimum and Maximum hours", async () => {
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByRole("slider", { name: "Minimum hours" })).toBeInTheDocument();
    await expect.element(page.getByRole("slider", { name: "Maximum hours" })).toBeInTheDocument();
  });

  it("the min-sessions slider names its thumb Minimum sessions", async () => {
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect
      .element(page.getByRole("slider", { name: "Minimum sessions" }))
      .toBeInTheDocument();
  });

  it("the min-progress trophy slider names its thumb Minimum trophy progress", async () => {
    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={() => {}} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect
      .element(page.getByRole("slider", { name: "Minimum trophy progress" }))
      .toBeInTheDocument();
  });

  it("the trophy facet appears only when the library has trophy data", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByText("Has a platinum").click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, hasPlatinum: true });
  });

  it("the min-progress trophy slider reports a non-zero threshold", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByText(/Min progress:/)).toBeVisible();

    page.getByRole("slider").last().element().focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minTrophyProgress: 1 }));
  });

  it("selections persist across facets and reveal the clear-all control", async () => {
    await render(<ControlledFilterBar data={withTrophies} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    await page.getByText("Shooter").click();
    await page.getByText("PS5").click();
    await page.getByText("Has a platinum").click();

    await expect.element(page.getByRole("group", { name: "Genre (1)" })).toBeVisible();
    await expect.element(page.getByRole("group", { name: "Platform (1)" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  });

  it("announces the live result count and no-results outcome", async () => {
    const { rerender } = await render(
      <FilterBar
        data={demoDashboard}
        filters={defaultFilters}
        onChange={() => {}}
        resultCount={12}
      />
    );

    await expect.element(page.getByRole("status")).toHaveTextContent("12 games shown");

    await rerender(
      <FilterBar
        data={demoDashboard}
        filters={defaultFilters}
        onChange={() => {}}
        resultCount={0}
      />
    );

    await expect.element(page.getByRole("status")).toHaveTextContent("No games match");
  });

  it("clears active filters and restores focus to search", async () => {
    const active = { ...defaultFilters, search: "halo", genres: ["Shooter" as const] };
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={active} onChange={onChange} />);

    await page.getByRole("button", { name: "Clear all" }).click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith(defaultFilters);
    await expect
      .element(page.getByRole("searchbox", { name: "Search games by name" }))
      .toHaveFocus();
  });

  it("disables unusable controls for an empty archive", async () => {
    await render(
      <FilterBar
        data={{ ...demoDashboard, games: [] }}
        filters={defaultFilters}
        onChange={() => {}}
        disabled
      />
    );

    await expect
      .element(page.getByRole("searchbox", { name: "Search games by name" }))
      .toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Filter games" })).toBeDisabled();
  });
});
