import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { GamesTable } from "./games-table";

const trophy = demoDashboard.games[0]!.trophy!;
const baseGame = demoDashboard.games[0]!;

const libraryGames: GamePlay[] = [
  {
    ...baseGame,
    titleId: "alpha",
    name: "Alpha and the Unnecessarily Long Complete Game Title That Must Remain Readable",
    platform: "PS5",
    hours: 10,
    playCount: 30,
    firstPlayed: "2020-01-01",
    lastPlayed: "2024-01-01",
    trophy: { ...trophy, progress: 50 },
  },
  {
    ...baseGame,
    titleId: "bravo",
    name: "Bravo",
    platform: "PS4",
    hours: 30,
    playCount: 10,
    firstPlayed: "2022-01-01",
    lastPlayed: "2021-01-01",
    trophy: { ...trophy, progress: 10 },
  },
  {
    ...baseGame,
    titleId: "charlie",
    name: "Charlie",
    platform: "PS3",
    hours: 20,
    playCount: 20,
    firstPlayed: "2018-01-01",
    lastPlayed: "2023-01-01",
    trophy: undefined,
  },
];

function libraryData(games: GamePlay[]): DashboardData {
  return {
    ...demoDashboard,
    games,
    meta: {
      ...demoDashboard.meta,
      totalGames: games.length,
      totalHours: games.reduce((total, game) => total + game.hours, 0),
      totalSessions: games.reduce((total, game) => total + game.playCount, 0),
    },
  };
}

const data = libraryData(libraryGames);

const sortCases = [
  {
    label: "Game",
    first: "Alpha and the Unnecessarily Long Complete Game Title",
    second: "Charlie",
    firstDirection: "ascending",
    secondDirection: "descending",
    firstStatus: "Sorted by game name, A to Z",
    secondStatus: "Sorted by game name, Z to A",
  },
  {
    label: "Lifetime hours",
    first: "Alpha and the Unnecessarily Long Complete Game Title",
    second: "Bravo",
    firstDirection: "ascending",
    secondDirection: "descending",
    firstStatus: "Sorted by lifetime hours, fewest hours first",
    secondStatus: "Sorted by lifetime hours, most hours first",
  },
  {
    label: "Sessions",
    first: "Alpha and the Unnecessarily Long Complete Game Title",
    second: "Bravo",
    firstDirection: "descending",
    secondDirection: "ascending",
    firstStatus: "Sorted by sessions, most sessions first",
    secondStatus: "Sorted by sessions, fewest sessions first",
  },
  {
    label: "First played",
    first: "Bravo",
    second: "Charlie",
    firstDirection: "descending",
    secondDirection: "ascending",
    firstStatus: "Sorted by first played, newest first",
    secondStatus: "Sorted by first played, oldest first",
  },
  {
    label: "Last played",
    first: "Alpha and the Unnecessarily Long Complete Game Title",
    second: "Bravo",
    firstDirection: "descending",
    secondDirection: "ascending",
    firstStatus: "Sorted by last played, newest first",
    secondStatus: "Sorted by last played, oldest first",
  },
  {
    label: "Trophies",
    first: "Alpha and the Unnecessarily Long Complete Game Title",
    second: "Bravo",
    firstDirection: "descending",
    secondDirection: "ascending",
    firstStatus: "Sorted by trophy progress, highest progress first",
    secondStatus: "Sorted by trophy progress, lowest progress first",
  },
] as const;

function firstDesktopRowText(): string {
  return page.getByRole("row").nth(1).element().textContent;
}

describe("GamesTable", () => {
  it("keeps every Library field readable in the desktop comparison table", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(1280, 800));

    await render(<GamesTable data={data} />);

    await expect.element(page.getByText("Every game you've played")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Game" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Sort by Lifetime hours" }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Sessions" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by First played" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Last played" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Trophies" })).toBeVisible();
    await expect
      .element(page.getByText(libraryGames[0]!.name, { exact: true }).first())
      .toBeVisible();

    const region = page.getByRole("region", { name: "3 games in the Library" });

    expect(region.element().scrollWidth).toBe(region.element().clientWidth);
  });

  it("switches to the information-equivalent cards before table values become cramped", async () => {
    await page.viewport(1024, 800);
    onTestFinished(() => page.viewport(1280, 800));

    await render(<GamesTable data={data} />);

    await expect.element(page.getByRole("combobox", { name: "Sort games by" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Sort by Game" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("article").first())
      .toHaveAccessibleName(libraryGames[1]!.name);
  });

  it.each(sortCases)("sorts $label in both directions", async (sortCase) => {
    await render(<GamesTable data={data} />);
    const header = page.getByRole("button", { name: `Sort by ${sortCase.label}` });
    const columnHeader = page.getByRole("columnheader", { name: `Sort by ${sortCase.label}` });

    await header.click();

    await expect.poll(firstDesktopRowText).toContain(sortCase.first);
    await expect.element(columnHeader).toHaveAttribute("aria-sort", sortCase.firstDirection);
    await expect.element(page.getByRole("status")).toHaveTextContent(sortCase.firstStatus);

    await header.click();

    await expect.poll(firstDesktopRowText).toContain(sortCase.second);
    await expect.element(columnHeader).toHaveAttribute("aria-sort", sortCase.secondDirection);
    await expect.element(page.getByRole("status")).toHaveTextContent(sortCase.secondStatus);
  });

  it("keeps missing trophy values last in both directions", async () => {
    await render(<GamesTable data={data} />);
    const header = page.getByRole("button", { name: "Sort by Trophies" });
    const lastRowText = () => page.getByRole("row").last().element().textContent;

    await header.click();

    await expect.poll(lastRowText).toContain("Charlie");

    await header.click();

    await expect.poll(lastRowText).toContain("Charlie");
  });

  it("uses labelled mobile cards with equivalent data and native sort controls", async () => {
    await page.viewport(390, 844);
    onTestFinished(() => page.viewport(1280, 800));

    await render(<GamesTable data={data} />);
    const sort = page.getByRole("combobox", { name: "Sort games by" });
    const direction = page.getByRole("button", {
      name: "Reverse sort order. Currently most hours first.",
    });

    await expect.element(sort).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Sort by Game" }))
      .not.toBeInTheDocument();

    const sortBox = sort.element().getBoundingClientRect();
    const directionBox = direction.element().getBoundingClientRect();

    expect(Math.abs(sortBox.top - directionBox.top)).toBeLessThan(1);
    expect(sortBox.height).toBeGreaterThanOrEqual(44);
    expect(directionBox.height).toBeGreaterThanOrEqual(44);

    await userEvent.selectOptions(sort, "lastPlayed");

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Sorted by last played, newest first");

    const firstArticle = page.getByRole("article").first();

    await expect.element(firstArticle).toHaveAccessibleName(libraryGames[0]!.name);
    await expect.element(firstArticle.getByText("Platform", { exact: true })).toBeVisible();
    await expect.element(firstArticle.getByText("Lifetime hours", { exact: true })).toBeVisible();
    await expect.element(firstArticle.getByText("Sessions", { exact: true })).toBeVisible();
    await expect.element(firstArticle.getByText("First played", { exact: true })).toBeVisible();
    await expect.element(firstArticle.getByText("Last played", { exact: true })).toBeVisible();
    await expect.element(firstArticle.getByText("Trophies", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reverse sort order. Currently newest first." }).click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Sorted by last played, oldest first");
    await expect.element(page.getByRole("article").first()).toHaveAccessibleName("Bravo");
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  });

  it("exposes a named scrollable region for a long library", async () => {
    await render(<GamesTable data={demoDashboard} />);
    const region = page.getByRole("region", { name: "98 games in the Library" });

    await expect.element(region).toBeVisible();
    expect(region.element().scrollHeight).toBeGreaterThan(region.element().clientHeight);
  });

  it("distinguishes active-filter results from the archive total", async () => {
    const filteredData = libraryData(demoDashboard.games.slice(0, 5));

    await render(
      <GamesTable data={filteredData} unfilteredTotal={demoDashboard.meta.totalGames} />
    );

    const summary = page.getByText(/filter/i);

    await expect.element(summary).toBeVisible();

    const summaryText = summary.element().textContent;

    expect(summaryText.match(/\d+/g)?.slice(0, 2)).toStrictEqual(["5", "98"]);
    expect(summaryText).toMatch(/filter/i);
    expect(summaryText).not.toMatch(/\b5 titles in total\b/i);
    await expect
      .element(
        page.getByRole("region", {
          name: /5 matching games.*98 titles/,
        })
      )
      .toBeVisible();
  });

  it("explains filtered no-results scope and clears the game filters", async () => {
    const onClearFilters = vi.fn();

    await render(
      <GamesTable
        data={libraryData([])}
        unfilteredTotal={demoDashboard.meta.totalGames}
        onClearFilters={onClearFilters}
      />
    );

    await expect
      .element(page.getByRole("heading", { name: "No matching games in Library" }))
      .toBeVisible();
    await expect.element(page.getByText(/98 games remain in the archive/)).toBeVisible();

    await page.getByRole("button", { name: "Clear game filters" }).click();

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty archive from filtered no results", async () => {
    await render(<GamesTable data={libraryData([])} unfilteredTotal={0} />);

    await expect
      .element(page.getByRole("heading", { name: "No games in this archive" }))
      .toBeVisible();
    await expect.element(page.getByText(/Connect PlayStation or restore an archive/)).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Clear game filters" }))
      .not.toBeInTheDocument();
  });
});
