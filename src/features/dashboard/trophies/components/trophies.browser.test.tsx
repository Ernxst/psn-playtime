import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import { TrophySection } from "./trophies";

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    ...Dashboard.data().games[0]!,
    titleId: overrides.titleId ?? "T",
    name: overrides.name ?? "Game",
    trophy: undefined,
    ...overrides,
  };
}

function dataWith(games: GamePlay[]): DashboardData {
  return Dashboard.data({ games });
}

describe("TrophySection", () => {
  it("surfaces account trophy KPIs straight from the profile", async () => {
    await render(<TrophySection data={Dashboard.data()} />);

    await expect.element(page.getByText("Trophy level")).toBeVisible();
    await expect.element(page.getByText("220", { exact: true })).toBeVisible();
    await expect.element(page.getByText("1,138", { exact: true })).toBeVisible();
  });

  it("lists the games where a platinum was earned", async () => {
    await render(<TrophySection data={Dashboard.data()} />);

    await expect.element(page.getByText("Your platinums")).toBeVisible();
    await expect.element(page.getByText("STAR WARS Jedi: Survivor™").first()).toBeVisible();
  });

  it("states the matched-game denominator rather than implying unmatched games are 0%", async () => {
    await render(<TrophySection data={Dashboard.data()} />);

    await expect
      .element(page.getByText(/Based on the 95 of 98 games with a matched trophy list/).first())
      .toBeVisible();
  });

  it("gives the trophy-split chart an accessible name covering each type", async () => {
    await render(<TrophySection data={Dashboard.data()} />);

    await expect
      .element(page.getByRole("img"))
      .toHaveAttribute(
        "aria-label",
        "Earned trophies by type: 9 platinum, 54 gold, 188 silver, 887 bronze."
      );
  });

  it("scopes per-game stats to matched games and excludes titles with no trophy list", async () => {
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

  it("notes when trophy data couldn't be loaded", async () => {
    await render(<TrophySection data={{ ...Dashboard.data(), trophiesUnavailable: true }} />);

    await expect.element(page.getByText(/Couldn't load trophy data/)).toBeVisible();
  });

  it("omits the trophy-unavailable note when trophy data loaded", async () => {
    await render(<TrophySection data={Dashboard.data()} />);

    await expect.element(page.getByText(/Couldn't load trophy data/)).not.toBeInTheDocument();
  });

  it("falls back to no-matched-list copy and drops per-game cards when nothing matched", async () => {
    const data = dataWith([
      game({ titleId: "a", name: "Unmatched A" }),
      game({ titleId: "b", name: "Unmatched B" }),
    ]);

    await render(<TrophySection data={data} />);

    // KPIs that depend on matched games fall back rather than implying 0%.
    await expect.element(page.getByText("no matched trophy lists yet").first()).toBeVisible();
    await expect.element(page.getByText("—", { exact: true })).toBeVisible();

    // Every per-game card scoped to matched games drops out of the document.
    await expect.element(page.getByText("Completion spectrum")).not.toBeInTheDocument();
    await expect.element(page.getByText("Your platinums")).not.toBeInTheDocument();
    await expect.element(page.getByText("Recent trophy activity")).not.toBeInTheDocument();

    await expect
      .element(page.getByText(/Based on the 0 of 2 games with a matched trophy list/).first())
      .toBeVisible();
  });

  it("shows an empty within-reach state when no plat-capable game is close", async () => {
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
});
