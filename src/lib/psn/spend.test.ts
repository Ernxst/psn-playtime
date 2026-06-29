import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/domain/transactions";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import { isAddOnPurchase, summariseAddOns, summarisePriceContext, summariseSpend } from "./spend";

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

describe(".summariseSpend byTitle", () => {
  it("ranks matched titles by total spend (base + add-ons) desc, incl. unplayed", () => {
    const library = data([
      game("Cyberpunk 2077", 40, "PPSA01491_00"),
      game("Bought But Unplayed", 0, "UNPLAYED"),
      game("Cheap Game", 5, "CHEAP"),
    ]);
    const summary = summariseSpend(library, [
      tx({
        productName: "Cyberpunk 2077",
        skuType: "STANDARD",
        skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
        amountMinor: 1999,
      }),
      tx({
        productName: "Cyberpunk 2077: Phantom Liberty",
        skuType: "PRE_ORDER",
        skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
        amountMinor: 2499,
      }),
      tx({ productName: "Bought But Unplayed", amountMinor: 4000 }),
      tx({ productName: "Cheap Game", amountMinor: 500 }),
      // Top-up and unmatched purchase: neither is per-game, so neither appears.
      tx({ productName: "PlayStation Store Wallet", amountMinor: 5000, kind: "top-up" }),
      tx({ productName: "Some Unowned Game", amountMinor: 6000 }),
    ]);

    expect(summary.byTitle).toEqual([
      { titleId: "PPSA01491_00", name: "Cyberpunk 2077", spend: 44.98 },
      { titleId: "UNPLAYED", name: "Bought But Unplayed", spend: 40 },
      { titleId: "CHEAP", name: "Cheap Game", spend: 5 },
    ]);
  });
});

describe(".summariseSpend name matching", () => {
  it("attributes a sequel purchase to its own title, not the shorter base title", () => {
    const summary = summariseSpend(
      data([game("God of War", 20, "GOW1"), game("God of War Ragnarök", 30, "GOW2")]),
      [tx({ productName: "God of War Ragnarök Digital Deluxe", amountMinor: 7000 })]
    );

    expect(summary.leaderboard).toEqual([
      { titleId: "GOW2", name: "God of War Ragnarök", hours: 30, spend: 70, perHour: 2.33 },
    ]);
  });

  it("still matches a bare base-game purchase to the base title", () => {
    const summary = summariseSpend(
      data([game("God of War", 20, "GOW1"), game("God of War Ragnarök", 30, "GOW2")]),
      [tx({ productName: "God of War", amountMinor: 4000 })]
    );

    expect(summary.leaderboard).toEqual([
      { titleId: "GOW1", name: "God of War", hours: 20, spend: 40, perHour: 2 },
    ]);
  });

  it("prefers the longest matching title regardless of library order", () => {
    const summary = summariseSpend(
      data([game("God of War Ragnarök", 30, "GOW2"), game("God of War", 20, "GOW1")]),
      [tx({ productName: "God of War Ragnarök Digital Deluxe", amountMinor: 7000 })]
    );

    expect(summary.leaderboard).toEqual([
      { titleId: "GOW2", name: "God of War Ragnarök", hours: 30, spend: 70, perHour: 2.33 },
    ]);
  });

  it("does not match a title that only appears mid-word in the product name", () => {
    const summary = summariseSpend(data([game("War", 10, "WAR")]), [
      tx({ productName: "Warhammer", amountMinor: 3000 }),
    ]);

    expect(summary.leaderboard).toEqual([]);
    expect(summary.unmatchedSpend).toBe(30);
  });
});

describe(".isAddOnPurchase", () => {
  it.each([
    tx({ productName: "Known Game", skuType: "ADD_ON" }),
    tx({ productName: "Known Game Season Pass" }),
    tx({ productName: "Known Game DLC" }),
    tx({ productName: "Known Game Expansion" }),
    tx({ productName: "Known Game Deluxe Upgrade" }),
    tx({ productName: "Known Game Add-On" }),
    tx({ productName: "Known Game Pack" }),
  ])("detects add-ons from skuType and product names", (row) => {
    expect(isAddOnPurchase(row, game("Known Game", 10))).toBe(true);
  });

  it.each([
    tx({ productName: "Known Game Deluxe Edition" }),
    tx({ productName: "Known Game Ultimate Edition" }),
    tx({ productName: "Known Game Bundle" }),
  ])("does not count base-game editions or bundles as add-ons", (row) => {
    expect(isAddOnPurchase(row, game("Known Game", 10))).toBe(false);
  });

  it("detects an expansion from the sku-id marker when skuType and name give no signal", () => {
    const row = tx({
      productName: "Cyberpunk 2077: Phantom Liberty",
      skuType: "PRE_ORDER",
      skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
    });

    expect(isAddOnPurchase(row, game("Cyberpunk 2077", 40, "PPSA01491_00"))).toBe(true);
  });

  it("does not treat the base-game sku-id content segment as an add-on", () => {
    const row = tx({
      productName: "Cyberpunk 2077",
      skuType: "STANDARD",
      skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
    });

    expect(isAddOnPurchase(row, game("Cyberpunk 2077", 40, "PPSA01491_00"))).toBe(false);
  });
});

describe(".summariseAddOns", () => {
  it("attributes add-ons to base games through the spend matcher", () => {
    const summary = summariseAddOns(data([game("Hades", 10, "PPSA01234_00")]), [
      tx({
        productName: "Hades Deluxe Upgrade",
        skuId: "EP4040-PPSA01234_00-HADESUPGRADE0000-E001",
        amountMinor: 499,
      }),
      tx({ productName: "Hades - Original Soundtrack", amountMinor: 999 }),
    ]);

    expect(summary).toEqual([{ titleId: "PPSA01234_00", name: "Hades", addOnCount: 2 }]);
  });

  it("ignores unmatched add-ons", () => {
    const summary = summariseAddOns(data([game("Hades", 10)]), [
      tx({ productName: "Unknown Game Season Pass", amountMinor: 999 }),
    ]);

    expect(summary).toEqual([]);
  });
});

describe(".summarisePriceContext", () => {
  it("labels a free claim as free", () => {
    const summary = summarisePriceContext(data([game("Free Claim", 5)]), [
      tx({ productName: "Free Claim", amountMinor: 0 }),
    ]);

    expect(summary).toEqual([
      {
        titleId: "Free Claim",
        name: "Free Claim",
        label: "free",
        paidMinor: 0,
        originalPriceMinor: undefined,
        currency: "£",
      },
    ]);
  });

  it("labels a large discount as deep-sale", () => {
    const summary = summarisePriceContext(data([game("Sale Hit", 20)]), [
      tx({
        productName: "Sale Hit",
        amountMinor: 374,
        originalPriceMinor: 4499,
        discountMinor: 4125,
      }),
    ]);

    expect(summary).toEqual([
      {
        titleId: "Sale Hit",
        name: "Sale Hit",
        label: "deep-sale",
        paidMinor: 374,
        originalPriceMinor: 4499,
        currency: "£",
      },
    ]);
  });

  it("labels a modest discount as discounted", () => {
    const summary = summarisePriceContext(data([game("Bit Off", 20)]), [
      tx({ productName: "Bit Off", amountMinor: 3999, originalPriceMinor: 4999 }),
    ]);

    expect(summary[0]?.label).toBe("discounted");
  });

  it("labels a negligible discount as full-price", () => {
    const summary = summarisePriceContext(data([game("Near Full", 20)]), [
      tx({ productName: "Near Full", amountMinor: 4900, originalPriceMinor: 4999 }),
    ]);

    expect(summary[0]?.label).toBe("full-price");
  });

  it("falls back to full-price when no original price is known", () => {
    const summary = summarisePriceContext(data([game("No Original", 20)]), [
      tx({ productName: "No Original", amountMinor: 5999 }),
    ]);

    expect(summary[0]?.label).toBe("full-price");
  });

  it("derives the discount from discountMinor when originalPriceMinor is absent", () => {
    const summary = summarisePriceContext(data([game("Disc Only", 20)]), [
      tx({ productName: "Disc Only", amountMinor: 1000, discountMinor: 4000 }),
    ]);

    expect(summary[0]?.label).toBe("deep-sale");
  });

  it("attributes the base-game purchase through the spend matcher and ignores add-ons", () => {
    const summary = summarisePriceContext(data([game("Hades", 10, "PPSA01234_00")]), [
      tx({
        productName: "Hades",
        skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
        amountMinor: 1599,
        originalPriceMinor: 1999,
      }),
      tx({ productName: "Hades - Season Pass", amountMinor: 999, originalPriceMinor: 999 }),
    ]);

    expect(summary).toEqual([
      {
        titleId: "PPSA01234_00",
        name: "Hades",
        label: "discounted",
        paidMinor: 1599,
        originalPriceMinor: 1999,
        currency: "£",
      },
    ]);
  });

  it("uses the base-game purchase, not a same-title expansion, for the price context", () => {
    const summary = summarisePriceContext(data([game("Cyberpunk 2077", 40, "PPSA01491_00")]), [
      tx({
        productName: "Cyberpunk 2077: Phantom Liberty",
        skuType: "PRE_ORDER",
        skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
        amountMinor: 2499,
        originalPriceMinor: 2499,
      }),
      tx({
        productName: "Cyberpunk 2077",
        skuType: "STANDARD",
        skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
        amountMinor: 1999,
        originalPriceMinor: 3999,
        discountMinor: 2000,
      }),
    ]);

    expect(summary).toEqual([
      {
        titleId: "PPSA01491_00",
        name: "Cyberpunk 2077",
        label: "deep-sale",
        paidMinor: 1999,
        originalPriceMinor: 3999,
        currency: "£",
      },
    ]);
  });

  it("ignores purchases that match no library title", () => {
    const summary = summarisePriceContext(data([game("Hades", 10)]), [
      tx({ productName: "Unknown Game", amountMinor: 1999, originalPriceMinor: 1999 }),
    ]);

    expect(summary).toEqual([]);
  });
});
