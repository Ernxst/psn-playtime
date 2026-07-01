import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionRow } from "@/domain/transactions";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { ExportButtons } from "./export-buttons";

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: "PPSA01234",
    name: "Hades",
    platform: "PS5",
    hours: 42.5,
    playCount: 30,
    genre: "Action-Adventure",
    isApp: false,
    ...overrides,
  };
}

function data(games: GamePlay[], onlineId = "tester"): DashboardData {
  return {
    profile: {
      onlineId,
      accountId: "acc",
      isPlus: false,
      trophyLevel: 1,
      levelProgress: 0,
      earned: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      totalTrophies: 0,
    },
    games,
    fetchedAt: "2024-06-01T00:00:00.000Z",
    meta: { totalGames: games.length, totalHours: 0, totalSessions: 0, appsExcluded: [], span: {} },
    isDemo: false,
    trophiesUnavailable: false,
  };
}

function tx(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    transactionId: "700000000000001",
    key: "line-1",
    date: "2025-08-29T13:31:23.987Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Hades",
    quantity: 1,
    amountMinor: 1599,
    currency: "£",
    displayAmount: "£15.99",
    ...overrides,
  };
}

const matching = tx({ skuId: "EP4040-PPSA01234_00-HADES00000000000-E001" });

describe("ExportButtons", () => {
  it("renders a button for each export", async () => {
    await render(<ExportButtons data={data([game({})])} transactions={[matching]} />);

    await expect
      .element(page.getByRole("button", { name: "Export transactions (CSV)" }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeVisible();
  });

  it("enables the games export when a transaction matched a library game", async () => {
    await render(<ExportButtons data={data([game({})])} transactions={[matching]} />);

    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeEnabled();
  });

  it("disables the games export when no transaction matched a library game", async () => {
    const unmatched = tx({ productName: "Some Unowned Game", skuId: undefined });

    await render(<ExportButtons data={data([game({})])} transactions={[unmatched]} />);

    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeDisabled();
  });

  it("downloads a CSV blob through a transient object URL when clicked", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await render(<ExportButtons data={data([game({})])} transactions={[matching]} />);

    await page.getByRole("button", { name: "Export transactions (CSV)" }).click();

    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:test");
  });
});
