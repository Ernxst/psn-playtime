import { describe, expect, it } from "vitest";
import { summariseSpend } from "./spend";
import type { TransactionRow } from "./transactions";
import type { DashboardData, GamePlay } from "./types";

function game(name: string, hours: number, titleId = name): GamePlay {
  return {
    titleId,
    name,
    platform: "PS5",
    hours,
    playCount: 1,
    genre: "Other",
    isApp: false,
  };
}

function data(games: GamePlay[]): DashboardData {
  return {
    profile: {
      onlineId: "tester",
      accountId: "acc",
      isPlus: false,
      trophyLevel: 1,
      levelProgress: 0,
      earned: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      totalTrophies: 0,
    },
    games,
    fetchedAt: "2024-06-01T00:00:00.000Z",
    meta: {
      totalGames: games.length,
      totalHours: 0,
      totalSessions: 0,
      appsExcluded: [],
      span: {},
    },
    isDemo: false,
  };
}

function tx(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    transactionId: "t",
    key: "k",
    date: "2023-01-01",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "",
    quantity: 1,
    amountMinor: 0,
    currency: "£",
    displayAmount: "",
    ...overrides,
  };
}

describe(".summariseSpend", () => {
  const library = data([
    game("Satisfactory", 366),
    game("Pricey Flop", 2),
    game("Free To Play", 50),
  ]);

  const transactions: TransactionRow[] = [
    tx({ productName: "Satisfactory", amountMinor: 3300, date: "2022-05-12" }),
    tx({ productName: "Pricey Flop Deluxe Edition", amountMinor: 6000, date: "2023-11-01" }),
    tx({ productName: "Some DLC nobody played", amountMinor: 1200, date: "2023-11-02" }),
    tx({
      productName: "PlayStation Store Wallet",
      amountMinor: 5000,
      kind: "top-up",
      date: "2022-01-01",
    }),
  ];

  const summary = summariseSpend(library, transactions);

  it("sums purchases into the total spend and excludes top-ups", () => {
    expect(summary.totalSpend).toBe(105);
    expect(summary.topUpTotal).toBe(50);
    expect(summary.purchaseCount).toBe(3);
  });

  it("computes £-per-hour for matched titles", () => {
    expect(summary.leaderboard).toEqual([
      { titleId: "Satisfactory", name: "Satisfactory", hours: 366, spend: 33, perHour: 0.09 },
      { titleId: "Pricey Flop", name: "Pricey Flop", hours: 2, spend: 60, perHour: 30 },
    ]);
  });

  it("orders the leaderboard by best value first", () => {
    expect(summary.leaderboard.map((l) => l.name)).toEqual(["Satisfactory", "Pricey Flop"]);
  });

  it("splits paid versus free library titles", () => {
    expect(summary.paidGames).toBe(2);
    expect(summary.freeGames).toBe(1);
  });

  it("surfaces purchase spend that matched no played title", () => {
    expect(summary.unmatchedSpend).toBe(12);
  });

  it("buckets purchase spend by transaction year", () => {
    expect(summary.byYear).toEqual([
      { year: 2022, spend: 33, purchases: 1 },
      { year: 2023, spend: 72, purchases: 2 },
    ]);
  });

  it("carries the currency through from the transactions", () => {
    expect(summary.currency).toBe("£");
  });

  it("matches a purchase to a library title by skuId when the name differs", () => {
    const summary = summariseSpend(data([game("Hades", 10, "PPSA01234_00")]), [
      tx({
        productName: "Hades Deluxe Bundle",
        skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
        amountMinor: 1599,
      }),
    ]);

    expect(summary.leaderboard).toEqual([
      { titleId: "PPSA01234_00", name: "Hades", hours: 10, spend: 15.99, perHour: 1.6 },
    ]);
  });

  it("excludes free (£0) claims from spend and paid-game counts", () => {
    const summary = summariseSpend(data([game("Free Claim", 5)]), [
      tx({ productName: "Free Claim", amountMinor: 0 }),
    ]);

    expect(summary.totalSpend).toBe(0);
    expect(summary.paidGames).toBe(0);
    expect(summary.freeGames).toBe(1);
  });

  it("excludes zero-hour matches from the leaderboard", () => {
    const summary = summariseSpend(data([game("Unplayed", 0)]), [
      tx({ productName: "Unplayed", amountMinor: 4000 }),
    ]);

    expect(summary.leaderboard).toEqual([]);
    expect(summary.paidGames).toBe(1);
  });
});
