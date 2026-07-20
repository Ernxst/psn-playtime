import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { GamesTable } from "./games-table";

describe("GamesTable", () => {
  it("lists played game names from the data", async () => {
    await render(<GamesTable data={demoDashboard} />);

    await expect.element(page.getByText("Every game you've played")).toBeInTheDocument();
    await expect.element(page.getByText("Forza Horizon 5")).toBeInTheDocument();
    await expect.element(page.getByText("Satisfactory")).toBeInTheDocument();
  });

  it("labels the hours column as PSN-recorded", async () => {
    await render(<GamesTable data={demoDashboard} />);

    await expect
      .element(page.getByRole("button", { name: "Sort by Lifetime hours" }))
      .toBeVisible();
    await expect.element(page.getByText(/Hours are what PSN recorded for each game/)).toBeVisible();
  });

  it("renders trophy progress as a percentage and a dash when absent", async () => {
    const trophy: NonNullable<GamePlay["trophy"]> = {
      progress: 80,
      earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
      total: 10,
      hasPlatinum: true,
      lastEarnedAt: "2024-01-01",
    };
    const data = {
      ...demoDashboard,
      games: demoDashboard.games.map((g, i) => (i === 0 ? { ...g, trophy } : g)),
    };

    await render(<GamesTable data={data} />);

    await expect.element(page.getByText("80%")).toBeVisible();
    await expect.element(page.getByText("—").first()).toBeVisible();
  });

  it("keeps games without trophy data at the bottom when sorting trophies both ways", async () => {
    const { container } = await render(<GamesTable data={demoDashboard} />);

    const lastTrophyCell = () =>
      container.querySelector("tbody tr:last-child td:last-child")?.textContent;
    const firstTrophyCell = () =>
      container.querySelector("tbody tr:first-child td:last-child")?.textContent;

    // First click sorts trophies descending: the fully-completed game leads, "—" rows sink.
    await page.getByRole("button", { name: "Sort by Trophies" }).click();

    await expect.poll(firstTrophyCell).toBe("100%");
    expect(lastTrophyCell()).toBe("—");

    // Second click flips to ascending: lowest % leads but "—" rows still stay at the bottom.
    await page.getByRole("button", { name: "Sort by Trophies" }).click();

    await expect.poll(firstTrophyCell).toBe("0%");
    expect(lastTrophyCell()).toBe("—");
  });

  it("clicking a column header re-sorts the rows in both directions", async () => {
    const { container } = await render(<GamesTable data={demoDashboard} />);

    // Default sort is hours-descending: the biggest game leads.
    await expect.element(page.getByText("Every game you've played")).toBeInTheDocument();

    const topByHours = container.querySelector("tbody tr")?.textContent;

    // First click sorts by last-played descending — the most recent game leads.
    await page.getByRole("button", { name: "Sort by Last played" }).click();

    await expect.poll(() => container.querySelector("tbody tr")?.textContent).not.toBe(topByHours);

    const topByRecent = container.querySelector("tbody tr")?.textContent;

    // Second click flips to ascending — the oldest game leads instead.
    await page.getByRole("button", { name: "Sort by Last played" }).click();

    await expect.poll(() => container.querySelector("tbody tr")?.textContent).not.toBe(topByRecent);
  });
});
