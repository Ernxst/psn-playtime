import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { DashboardData, GamePlay } from "@/lib/psn/contract.schema";
import { demoDashboard } from "@/lib/psn/mock";
import { TrophySection } from "./trophies";

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: overrides.titleId ?? "T",
    name: overrides.name ?? "Game",
    platform: "PS5",
    hours: 10,
    playCount: 1,
    genre: "Other",
    isApp: false,
    ...overrides,
  };
}

function dataWith(games: GamePlay[]): DashboardData {
  return { ...demoDashboard, games };
}

test("surfaces account trophy KPIs straight from the profile", async () => {
  await render(<TrophySection data={demoDashboard} />);

  await expect.element(page.getByText("Trophy level")).toBeVisible();
  await expect.element(page.getByText("220", { exact: true })).toBeVisible();
  await expect.element(page.getByText("1,138", { exact: true })).toBeVisible();
});

test("lists the games where a platinum was earned", async () => {
  await render(<TrophySection data={demoDashboard} />);

  await expect.element(page.getByText("Your platinums")).toBeVisible();
  await expect.element(page.getByText("STAR WARS Jedi: Survivor™").first()).toBeVisible();
});

test("states the matched-game denominator rather than implying unmatched games are 0%", async () => {
  await render(<TrophySection data={demoDashboard} />);

  await expect
    .element(page.getByText(/Based on the 95 of 98 games with a matched trophy list/).first())
    .toBeVisible();
});

test("gives the trophy-split chart an accessible name covering each type", async () => {
  const { container } = await render(<TrophySection data={demoDashboard} />);

  const chart = container.querySelector('[role="img"]');
  if (!chart) throw new Error("expected the trophy-split chart to expose role=img");

  expect(chart).toHaveAttribute(
    "aria-label",
    "Earned trophies by type: 9 platinum, 54 gold, 188 silver, 887 bronze."
  );
});

test("scopes per-game stats to matched games and excludes titles with no trophy list", async () => {
  const data = dataWith([
    game({
      titleId: "reach",
      name: "Almost Platted",
      trophy: {
        progress: 92,
        earned: { platinum: 0, gold: 4, silver: 6, bronze: 20 },
        total: 31,
        hasPlatinum: true,
        lastEarnedAt: "2026-01-02",
      },
    }),
    game({ titleId: "unknown", name: "Never Matched" }),
  ]);

  await render(<TrophySection data={data} />);

  await expect.element(page.getByText("Platinum within reach")).toBeVisible();
  await expect.element(page.getByText("Almost Platted").first()).toBeVisible();
  await expect
    .element(page.getByText(/Based on the 1 of 2 games with a matched trophy list/).first())
    .toBeVisible();
});

test("shows an empty within-reach state when no plat-capable game is close", async () => {
  const data = dataWith([
    game({
      titleId: "far",
      name: "Barely Started",
      trophy: {
        progress: 12,
        earned: { platinum: 0, gold: 0, silver: 1, bronze: 3 },
        total: 30,
        hasPlatinum: true,
        lastEarnedAt: "2025-12-01",
      },
    }),
  ]);

  await render(<TrophySection data={data} />);

  await expect.element(page.getByText(/No plat-capable game is 80%\+ complete/)).toBeVisible();
});
