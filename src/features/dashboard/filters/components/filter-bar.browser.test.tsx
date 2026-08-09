/* oxlint-disable test-contract/no-dom-selector -- These tests verify sheet geometry, clipping, and scroll ownership. */
import { useState } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
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

function expectWideControlGeometry(
  search: DOMRect | undefined,
  timeframe: DOMRect | undefined,
  activity: DOMRect | undefined,
  actions: DOMRect | undefined
) {
  expect(search?.top).toBeCloseTo(timeframe?.top ?? 0, 0);
  expect(timeframe?.top).toBeCloseTo(activity?.top ?? 0, 0);
  expect(activity?.top).toBeCloseTo(actions?.top ?? 0, 0);
}

function expectCompactControlGeometry(
  search: DOMRect | undefined,
  timeframe: DOMRect | undefined,
  activity: DOMRect | undefined,
  actions: DOMRect | undefined
) {
  expect(search?.left).toBeCloseTo(activity?.left ?? 0, 0);
  expect(timeframe?.left).toBeCloseTo(actions?.left ?? 0, 0);
  expect(activity?.top).toBeGreaterThanOrEqual(timeframe?.bottom ?? 0);
}

function expectNarrowControlGeometry({
  search,
  timeframe,
  activity,
  actions,
  task,
}: Record<string, DOMRect | undefined>) {
  for (const rect of [search, timeframe, activity, actions]) {
    expect(rect?.left).toBeCloseTo(task?.left ?? 0, 0);
    expect(rect?.right).toBeCloseTo(task?.right ?? 0, 0);
  }

  expect(timeframe?.top).toBeGreaterThanOrEqual(search?.bottom ?? 0);
  expect(activity?.top).toBeGreaterThanOrEqual(timeframe?.bottom ?? 0);
  expect(actions?.top).toBeGreaterThanOrEqual(activity?.bottom ?? 0);
}

function expectBounded(elements: Element[]) {
  for (const element of elements) {
    const rect = element.getBoundingClientRect();

    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
  }

  expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
}

describe("FilterBar", () => {
  it("opens a named filter sheet with persistent task controls", async () => {
    await render(<ControlledFilterBar />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();
    await expect.element(page.getByText("Applies to Profile, History and Library")).toBeVisible();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent(`${demoDashboard.games.length} games shown · No filters active`);
    await expect.element(page.getByRole("button", { name: "Clear" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Done filtering" })).toBeVisible();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("preserves document geometry and scroll while filters change and the sheet closes", async () => {
    onTestFinished(() => window.scrollTo(0, 0));
    await render(
      <div style={{ minHeight: 1800, paddingTop: 400 }}>
        <ControlledFilterBar />
      </div>
    );
    window.scrollTo(0, 320);

    expect(window.scrollY).toBe(320);

    const trigger = page.getByRole("button", { name: "Filter games" });
    const triggerElement = trigger.element();
    const before = triggerElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;

    await trigger.click();

    await expect.element(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();

    await page.getByRole("checkbox", { name: "Shooter" }).click();

    await expect.element(page.getByRole("status")).toHaveTextContent("1 filter active");
    expect(window.scrollY).toBe(320);
    expect(document.documentElement.clientWidth).toBe(viewportWidth);
    expect(triggerElement.getBoundingClientRect().width).toBe(before.width);

    await userEvent.keyboard("{Escape}");

    await expect.element(trigger).toHaveFocus();
    expect(window.scrollY).toBe(320);
    expect(document.documentElement.clientWidth).toBe(viewportWidth);
    expect(triggerElement.getBoundingClientRect().x).toBe(before.x);
    expect(triggerElement.getBoundingClientRect().y).toBe(before.y);
    expect(triggerElement.getBoundingClientRect().width).toBe(before.width);
  });

  it("preserves document scroll while the visible timeframe and activity choices change", async () => {
    onTestFinished(() => window.scrollTo(0, 0));
    await render(
      <div style={{ minHeight: 1800, paddingTop: 400 }}>
        <ControlledFilterBar />
      </div>
    );
    window.scrollTo(0, 320);

    await page.getByRole("radio", { name: "12 months" }).click();
    await page.getByRole("radio", { name: "Active" }).click();

    await expect.poll(() => window.scrollY).toBe(320);
  });

  it.each([
    [1440, 900],
    [1280, 900],
    [1279, 900],
    [1024, 768],
    [768, 768],
    [767, 768],
    [390, 844],
    [320, 844],
  ])("keeps the filtering controls aligned at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));
    await render(<ControlledFilterBar />);
    const search = page.getByRole("searchbox", { name: "Search games by name" }).element();
    const searchGroup = search.closest("label");
    const searchSurface = search.closest<HTMLElement>('[data-slot="input-control"]');
    const timeframe = page.getByRole("radio", { name: "All time" }).element().closest("fieldset");
    const timeframeSurface = page.getByRole("radio", { name: "All time" }).element()
      .parentElement?.parentElement;
    const activity = page
      .getByRole("radio", { name: "All", exact: true })
      .element()
      .closest("fieldset");
    const activitySurface = page.getByRole("radio", { name: "All", exact: true }).element()
      .parentElement?.parentElement;
    const trigger = page.getByRole("button", { name: "Filter games" }).element();
    const actions = trigger.closest("section");
    const task = document.querySelector<HTMLElement>("[data-filter-task]");
    const groups = [searchGroup, timeframe, activity, actions].filter(
      (group): group is HTMLElement => group !== null
    );

    expect(groups).toHaveLength(4);
    expect(task).not.toBeNull();
    expect(searchSurface?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(timeframeSurface?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(activitySurface?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    for (const group of groups) {
      const rect = group.getBoundingClientRect();

      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
    }
    const searchRect = searchGroup?.getBoundingClientRect();
    const timeframeRect = timeframe?.getBoundingClientRect();
    const activityRect = activity?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    const taskRect = task?.getBoundingClientRect();
    if (width >= 1280)
      expectWideControlGeometry(searchRect, timeframeRect, activityRect, actionsRect);
    else if (width >= 768)
      expectCompactControlGeometry(searchRect, timeframeRect, activityRect, actionsRect);
    else
      expectNarrowControlGeometry({
        search: searchRect,
        timeframe: timeframeRect,
        activity: activityRect,
        actions: actionsRect,
        task: taskRect,
      });

    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  });

  it.each([
    [1024, 768],
    [390, 844],
  ])("keeps bounds through filtering state combinations at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));
    const { rerender } = await render(<ControlledFilterBar />);

    for (const name of ["All time", "12 months", "2 years", "This year"]) {
      await page.getByRole("radio", { name }).click();
      expectBounded([
        page.getByRole("searchbox", { name: "Search games by name" }).element(),
        page.getByRole("button", { name: "Filter games" }).element(),
      ]);
    }
    for (const name of ["All", "Active", "Dormant"]) {
      await page.getByRole("radio", { name, exact: true }).click();
      expectBounded([page.getByRole("button", { name: "Filter games" }).element()]);
    }

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByRole("checkbox", { name: "Shooter" }).click();
    await page.getByRole("button", { name: "Done filtering" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).toBeVisible();

    expectBounded([
      page.getByRole("button", { name: "Filter games" }).element(),
      page.getByRole("button", { name: "Clear all" }).element(),
    ]);
    await page.getByRole("button", { name: "Clear all" }).click();

    await page.getByRole("button", { name: "Filter games" }).click();
    const from = page.getByLabelText("Last played from");
    await from.fill("2024-01");

    await expect.element(page.getByText("Use YYYY-MM-DD.")).toBeVisible();

    await from.fill("2024-02-30");

    await expect.element(page.getByText("Enter a real calendar date in YYYY-MM-DD.")).toBeVisible();

    await from.fill("2024-02-29");
    expectBounded([page.getByRole("dialog", { name: "Filter games" }).element()]);
    await page.getByRole("button", { name: "Done filtering" }).click();

    await rerender(
      <FilterBar
        data={demoDashboard}
        filters={{ ...defaultFilters, search: "missing" }}
        onChange={() => {}}
        resultCount={0}
      />
    );

    await expect
      .element(
        page.getByText("No games match these filters. Clear them to see your full library again.")
      )
      .toBeVisible();

    expectBounded([page.getByRole("button", { name: "Clear filters" }).element()]);
  });

  it("reports search and checkbox changes through the controlled filter model", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("halo");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, search: "halo" });
  });

  it("keeps exact date and numeric threshold controls without a native date picker", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    const from = page.getByLabelText("Last played from");
    await from.fill("2024-01-01");
    await page.getByRole("spinbutton", { name: "Minimum hours" }).fill("12");
    await page.getByRole("spinbutton", { name: "Maximum hours" }).fill("300");
    await page.getByRole("spinbutton", { name: "Minimum sessions" }).fill("4");
    await page.getByRole("spinbutton", { name: "Minimum trophy progress" }).fill("75");

    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenLastCalledWith({
      ...defaultFilters,
      minTrophyProgress: 75,
    });
    expect(from.element().getAttribute("type")).toBe("text");
    await expect
      .element(page.getByText("Dates select games by when you last played them."))
      .toBeVisible();
  });

  it("keeps a partial last-played date as a draft instead of applying it", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    const from = page.getByLabelText("Last played from");
    await from.fill("2024-01");

    expect(onChange).not.toHaveBeenCalled();
    expect(from.element().getAttribute("aria-invalid")).toBe("true");
    await expect.element(page.getByText("Use YYYY-MM-DD.")).toBeVisible();
  });

  it("keeps an impossible last-played date as a draft instead of applying it", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    const from = page.getByLabelText("Last played from");
    await from.fill("2024-02-30");

    expect(onChange).not.toHaveBeenCalled();
    expect(from.element().getAttribute("aria-invalid")).toBe("true");
    await expect.element(page.getByText("Enter a real calendar date in YYYY-MM-DD.")).toBeVisible();
  });

  it("applies a complete valid last-played date", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByLabelText("Last played from").fill("2024-02-29");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...defaultFilters,
      lastPlayedFrom: "2024-02-29",
    });
  });

  it("clears an applied last-played date", async () => {
    const onChange = vi.fn();
    await render(
      <FilterBar
        data={demoDashboard}
        filters={{ ...defaultFilters, lastPlayedFrom: "2024-01-01" }}
        onChange={onChange}
      />
    );

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByLabelText("Last played from").fill("");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...defaultFilters,
      lastPlayedFrom: undefined,
    });
  });

  it("uses radio semantics and arrow-key selection for the exclusive activity filter", async () => {
    await render(<ControlledFilterBar />);

    const all = page.getByRole("radio", { name: "All", exact: true });
    const active = page.getByRole("radio", { name: "Active" });

    await expect.element(all).toBeChecked();
    await expect.element(active).not.toBeChecked();

    all.element().focus();
    await userEvent.keyboard("{ArrowRight}");

    await expect.element(active).toBeChecked();
  });

  it("reports timeframe changes through the controlled filter model and explains their lifetime-hour scope", async () => {
    const onChange = vi.fn();
    await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("radio", { name: "12 months" }).click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...defaultFilters,
      timeframe: "last-12-months",
    });
    await expect
      .element(
        page.getByText(/Selects games by last played\. Displayed hours remain lifetime totals/)
      )
      .toBeVisible();
  });

  it("searches the long franchise facet without changing selected filters", async () => {
    await render(<ControlledFilterBar />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByRole("searchbox", { name: "Search franchises" }).fill("Forza");

    await expect.element(page.getByText(/Forza/).first()).toBeVisible();
    await expect.element(page.getByText("Grand Theft Auto")).not.toBeInTheDocument();
  });

  it("the trophy facet appears only when the library has trophy data", async () => {
    const onChange = vi.fn();

    await render(<FilterBar data={withTrophies} filters={defaultFilters} onChange={onChange} />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByText("Has a platinum").click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaultFilters, hasPlatinum: true });
  });

  it("gives every filter option an accessible name and a full-row target", async () => {
    await render(<ControlledFilterBar data={withTrophies} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    const expected = [
      "Action-Adventure",
      "Indie/Casual",
      "Open World",
      "Other",
      "RPG",
      "Racing",
      "Shooter",
      "Sports",
      "Survival/Craft",
      "PS4",
      "PS5",
      "Battlefield",
      "Call of Duty",
      "Cyberpunk",
      "F1",
      "FIFA / EA FC",
      "Fall Guys",
      "Fortnite",
      "Forza",
      "Gears of War",
      "God of War",
      "Grand Theft Auto",
      "Horizon",
      "Mass Effect",
      "Minecraft",
      "NBA 2K",
      "Need for Speed",
      "No Man's Sky",
      "Satisfactory",
      "Star Wars",
      "Subnautica",
      "The Witcher",
      "Tom Clancy",
      "Tomb Raider",
      "Warhammer 40K",
      "Has a platinum",
    ];
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'));
    const names = options.map((option) => option.closest("label")?.textContent.trim());
    const heights = options.map(
      (option) => option.closest("label")?.getBoundingClientRect().height ?? 0
    );

    expect(names).toStrictEqual(expected);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

    const firstRow = page
      .getByRole("checkbox", { name: "Action-Adventure" })
      .element()
      .closest("label")
      ?.getBoundingClientRect();
    const secondRow = page
      .getByRole("checkbox", { name: "Open World" })
      .element()
      .closest("label")
      ?.getBoundingClientRect();

    expect(secondRow?.top).toBe(firstRow?.bottom);

    await expect.element(page.getByRole("checkbox", { name: "Open World" })).toBeVisible();
    await expect.element(page.getByRole("checkbox", { name: "Call of Duty" })).toBeVisible();
    await expect.element(page.getByRole("checkbox", { name: "Grand Theft Auto" })).toBeVisible();
    await expect.element(page.getByRole("checkbox", { name: "No Man's Sky" })).toBeVisible();

    const openWorld = page.getByRole("checkbox", { name: "Open World" });
    openWorld.element().focus();
    await userEvent.keyboard(" ");

    await expect.element(openWorld).toBeChecked();
  });

  it("retains checkbox facets and reports their selected counts", async () => {
    await render(<ControlledFilterBar data={withTrophies} />);

    await page.getByRole("button", { name: "Filter games" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    await page.getByText("Shooter").click();
    await page.getByText("PS5").click();
    await page.getByText("Has a platinum").click();

    await expect.element(page.getByRole("group", { name: "Genre (1)" })).toBeVisible();
    await expect.element(page.getByRole("group", { name: "Platform (1)" })).toBeVisible();
    await expect.element(page.getByRole("status")).toHaveTextContent("3 filters active");

    await page.getByRole("button", { name: "Done filtering" }).click();

    await expect.element(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  });

  it("clears the sheet without closing the filtering task or losing focus", async () => {
    await render(<ControlledFilterBar />);

    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByRole("checkbox", { name: "Shooter" }).click();
    const clear = page.getByRole("button", { name: "Clear", exact: true });

    await clear.click();

    await expect.element(page.getByRole("dialog", { name: "Filter games" })).toBeVisible();
    await expect.element(clear).toHaveFocus();
    await expect.element(page.getByRole("checkbox", { name: "Shooter" })).not.toBeChecked();
    await expect.element(page.getByRole("status")).toHaveTextContent("No filters active");
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

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("12 games shown · No filters active");
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    await rerender(
      <FilterBar
        data={demoDashboard}
        filters={defaultFilters}
        onChange={() => {}}
        resultCount={0}
      />
    );

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("0 games shown · No filters active");
  });

  it("offers a direct recovery action when active filters produce no results", async () => {
    const active = { ...defaultFilters, search: "missing" };
    const onChange = vi.fn();
    await render(
      <FilterBar data={demoDashboard} filters={active} onChange={onChange} resultCount={0} />
    );

    await expect
      .element(
        page.getByText("No games match these filters. Clear them to see your full library again.")
      )
      .toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();

    expect(onChange).toHaveBeenCalledExactlyOnceWith(defaultFilters);
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
