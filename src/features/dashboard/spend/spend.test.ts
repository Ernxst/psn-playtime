import { describe, expect, it } from "vitest";
import type { GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
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

describe(".summariseSpend", () => {
  const library = () =>
    Dashboard.data({
      games: [game("Satisfactory", 366), game("Pricey Flop", 2), game("Free To Play", 50)],
    });

  const transactions = () => [
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Satisfactory",
      amountMinor: 3300,
      date: "2022-05-12",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Pricey Flop Deluxe Edition",
      amountMinor: 6000,
      date: "2023-11-01",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Some DLC nobody played",
      amountMinor: 1200,
      date: "2023-11-02",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "PlayStation Store Wallet",
      amountMinor: 5000,
      kind: "top-up",
      date: "2022-01-01",
    }),
  ];

  const summary = () => summariseSpend(library(), transactions());

  it("sums purchases into the total spend and excludes top-ups", () => {
    expect(summary().totalSpend).toBe(105);
    expect(summary().topUpTotal).toBe(50);
    expect(summary().purchaseCount).toBe(3);
  });

  it("computes £-per-hour for matched titles", () => {
    expect(summary().leaderboard).toStrictEqual([
      { titleId: "Satisfactory", name: "Satisfactory", hours: 366, spend: 33, perHour: 0.09 },
      { titleId: "Pricey Flop", name: "Pricey Flop", hours: 2, spend: 60, perHour: 30 },
    ]);
  });

  it("orders the leaderboard by best value first", () => {
    expect(summary().leaderboard.map((l) => l.name)).toStrictEqual(["Satisfactory", "Pricey Flop"]);
  });

  it("splits paid versus free library titles", () => {
    expect(summary().paidGames).toBe(2);
    expect(summary().freeGames).toBe(1);
  });

  it("surfaces purchase spend that matched no played title", () => {
    expect(summary().unmatchedSpend).toBe(12);
  });

  it("buckets purchase spend by transaction year", () => {
    expect(summary().byYear).toStrictEqual([
      { year: 2022, spend: 33, purchases: 1 },
      { year: 2023, spend: 72, purchases: 2 },
    ]);
  });

  it("carries the currency through from the transactions", () => {
    expect(summary().currency).toBe("£");
  });

  it("matches a purchase to a library title by skuId when the name differs", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("Hades", 10, "PPSA01234_00")] }), [
      Transactions.row({
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Hades Deluxe Bundle",
        skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
        amountMinor: 1599,
      }),
    ]);

    expect(summary.leaderboard).toStrictEqual([
      { titleId: "PPSA01234_00", name: "Hades", hours: 10, spend: 15.99, perHour: 1.6 },
    ]);
  });

  it("excludes free (£0) claims from spend and paid-game counts", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("Free Claim", 5)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Free Claim",
        amountMinor: 0,
      }),
    ]);

    expect(summary.totalSpend).toBe(0);
    expect(summary.paidGames).toBe(0);
    expect(summary.freeGames).toBe(1);
  });

  it("excludes zero-hour matches from the leaderboard", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("Unplayed", 0)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Unplayed",
        amountMinor: 4000,
      }),
    ]);

    expect(summary.leaderboard).toStrictEqual([]);
    expect(summary.paidGames).toBe(1);
  });

  it("treats a purchase with an unnameable product as unmatched spend", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("Real Game", 10)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "™®©",
        amountMinor: 1500,
      }),
    ]);

    expect(summary.unmatchedSpend).toBe(15);
    expect(summary.paidGames).toBe(0);
  });

  it("omits purchases with an unparseable date from the year breakdown", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("Dated", 10)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Dated",
        amountMinor: 2000,
        date: "not-a-date",
      }),
    ]);

    expect(summary.byYear).toStrictEqual([]);
    expect(summary.totalSpend).toBe(20);
  });

  it("keeps the first library game when two share a normalised name", () => {
    const summary = summariseSpend(
      Dashboard.data({ games: [game("Hades", 10, "H1"), game("Hades!", 20, "H2")] }),
      [
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Hades",
          amountMinor: 1000,
        }),
      ]
    );

    expect(summary.paidGames).toBe(1);
    expect(summary.leaderboard).toStrictEqual([
      { titleId: "H1", name: "Hades", hours: 10, spend: 10, perHour: 1 },
    ]);
  });
});

describe(".summariseSpend byTitle", () => {
  it("ranks matched titles by total spend (base + add-ons) desc, incl. unplayed", () => {
    const library = Dashboard.data({
      games: [
        game("Cyberpunk 2077", 40, "PPSA01491_00"),
        game("Bought But Unplayed", 0, "UNPLAYED"),
        game("Cheap Game", 5, "CHEAP"),
      ],
    });
    const summary = summariseSpend(library, [
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Cyberpunk 2077",
        skuType: "STANDARD",
        skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
        amountMinor: 1999,
      }),
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Cyberpunk 2077: Phantom Liberty",
        skuType: "PRE_ORDER",
        skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
        amountMinor: 2499,
      }),
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Bought But Unplayed",
        amountMinor: 4000,
      }),
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Cheap Game",
        amountMinor: 500,
      }),
      // Top-up and unmatched purchase: neither is per-game, so neither appears.
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "PlayStation Store Wallet",
        amountMinor: 5000,
        kind: "top-up",
      }),
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Some Unowned Game",
        amountMinor: 6000,
      }),
    ]);

    expect(summary.byTitle).toStrictEqual([
      { titleId: "PPSA01491_00", name: "Cyberpunk 2077", spend: 44.98 },
      { titleId: "UNPLAYED", name: "Bought But Unplayed", spend: 40 },
      { titleId: "CHEAP", name: "Cheap Game", spend: 5 },
    ]);
  });

  it("breaks equal total spend ties by name", () => {
    const summary = summariseSpend(
      Dashboard.data({ games: [game("Zelda", 10, "Z"), game("Alpha", 10, "A")] }),
      [
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Zelda",
          amountMinor: 2000,
        }),
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Alpha",
          amountMinor: 2000,
        }),
      ]
    );

    expect(summary.byTitle).toStrictEqual([
      { titleId: "A", name: "Alpha", spend: 20 },
      { titleId: "Z", name: "Zelda", spend: 20 },
    ]);
  });
});

describe(".summariseSpend name matching", () => {
  it("attributes a sequel purchase to its own title, not the shorter base title", () => {
    const summary = summariseSpend(
      Dashboard.data({
        games: [game("God of War", 20, "GOW1"), game("God of War Ragnarök", 30, "GOW2")],
      }),
      [
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "God of War Ragnarök Digital Deluxe",
          amountMinor: 7000,
        }),
      ]
    );

    expect(summary.leaderboard).toStrictEqual([
      { titleId: "GOW2", name: "God of War Ragnarök", hours: 30, spend: 70, perHour: 2.33 },
    ]);
  });

  it("still matches a bare base-game purchase to the base title", () => {
    const summary = summariseSpend(
      Dashboard.data({
        games: [game("God of War", 20, "GOW1"), game("God of War Ragnarök", 30, "GOW2")],
      }),
      [
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "God of War",
          amountMinor: 4000,
        }),
      ]
    );

    expect(summary.leaderboard).toStrictEqual([
      { titleId: "GOW1", name: "God of War", hours: 20, spend: 40, perHour: 2 },
    ]);
  });

  it("prefers the longest matching title regardless of library order", () => {
    const summary = summariseSpend(
      Dashboard.data({
        games: [game("God of War Ragnarök", 30, "GOW2"), game("God of War", 20, "GOW1")],
      }),
      [
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "God of War Ragnarök Digital Deluxe",
          amountMinor: 7000,
        }),
      ]
    );

    expect(summary.leaderboard).toStrictEqual([
      { titleId: "GOW2", name: "God of War Ragnarök", hours: 30, spend: 70, perHour: 2.33 },
    ]);
  });

  it("does not match a title that only appears mid-word in the product name", () => {
    const summary = summariseSpend(Dashboard.data({ games: [game("War", 10, "WAR")] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Warhammer",
        amountMinor: 3000,
      }),
    ]);

    expect(summary.leaderboard).toStrictEqual([]);
    expect(summary.unmatchedSpend).toBe(30);
  });
});

describe(".isAddOnPurchase", () => {
  it.each([
    Transactions.row({
      skuId: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game",
      skuType: "ADD_ON",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Season Pass",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game DLC",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Expansion",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Deluxe Upgrade",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Add-On",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Pack",
    }),
  ])("detects add-ons from skuType and product names", (row) => {
    expect(isAddOnPurchase(row, game("Known Game", 10))).toBe(true);
  });

  it.each([
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Deluxe Edition",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Ultimate Edition",
    }),
    Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Known Game Bundle",
    }),
  ])("does not count base-game editions or bundles as add-ons", (row) => {
    expect(isAddOnPurchase(row, game("Known Game", 10))).toBe(false);
  });

  it("detects an expansion from the sku-id marker when skuType and name give no signal", () => {
    const row = Transactions.row({
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Cyberpunk 2077: Phantom Liberty",
      skuType: "PRE_ORDER",
      skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
    });

    expect(isAddOnPurchase(row, game("Cyberpunk 2077", 40, "PPSA01491_00"))).toBe(true);
  });

  it("does not treat the base-game sku-id content segment as an add-on", () => {
    const row = Transactions.row({
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Cyberpunk 2077",
      skuType: "STANDARD",
      skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
    });

    expect(isAddOnPurchase(row, game("Cyberpunk 2077", 40, "PPSA01491_00"))).toBe(false);
  });

  it("does not treat a non-purchase transaction as an add-on", () => {
    const row = Transactions.row({
      skuId: undefined,
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      kind: "top-up",
      productName: "Known Game Season Pass",
    });

    expect(isAddOnPurchase(row, game("Known Game", 10))).toBe(false);
  });

  it("does not treat an unrecognised standalone product with no matched game as an add-on", () => {
    expect(
      isAddOnPurchase(
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Standalone Indie",
        })
      )
    ).toBe(false);
  });

  it("ignores a sku id with no content segment", () => {
    const row = Transactions.row({
      skuType: undefined,
      originalPriceMinor: undefined,
      discountMinor: undefined,
      productName: "Plain Game",
      skuId: "EP4082-PPSA01491_00",
    });

    expect(isAddOnPurchase(row, game("Other", 10))).toBe(false);
  });
});

describe(".summariseAddOns", () => {
  it("attributes add-ons to base games through the spend matcher", () => {
    const summary = summariseAddOns(
      Dashboard.data({ games: [game("Hades", 10, "PPSA01234_00")] }),
      [
        Transactions.row({
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Hades Deluxe Upgrade",
          skuId: "EP4040-PPSA01234_00-HADESUPGRADE0000-E001",
          amountMinor: 499,
        }),
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          originalPriceMinor: undefined,
          discountMinor: undefined,
          productName: "Hades - Original Soundtrack",
          amountMinor: 999,
        }),
      ]
    );

    expect(summary).toStrictEqual([{ titleId: "PPSA01234_00", name: "Hades", addOnCount: 2 }]);
  });

  it("ignores unmatched add-ons", () => {
    const summary = summariseAddOns(Dashboard.data({ games: [game("Hades", 10)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Unknown Game Season Pass",
        amountMinor: 999,
      }),
    ]);

    expect(summary).toStrictEqual([]);
  });
});

describe(".summarisePriceContext", () => {
  it("labels a free claim as free", () => {
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Free Claim", 5)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "Free Claim",
        amountMinor: 0,
      }),
    ]);

    expect(summary).toStrictEqual([
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
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Sale Hit", 20)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        productName: "Sale Hit",
        amountMinor: 374,
        originalPriceMinor: 4499,
        discountMinor: 4125,
      }),
    ]);

    expect(summary).toStrictEqual([
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
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Bit Off", 20)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        discountMinor: undefined,
        productName: "Bit Off",
        amountMinor: 3999,
        originalPriceMinor: 4999,
      }),
    ]);

    expect(summary[0]?.label).toBe("discounted");
  });

  it("labels a negligible discount as full-price", () => {
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Near Full", 20)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        discountMinor: undefined,
        productName: "Near Full",
        amountMinor: 4900,
        originalPriceMinor: 4999,
      }),
    ]);

    expect(summary[0]?.label).toBe("full-price");
  });

  it("falls back to full-price when no original price is known", () => {
    const summary = summarisePriceContext(Dashboard.data({ games: [game("No Original", 20)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        discountMinor: undefined,
        productName: "No Original",
        amountMinor: 5999,
      }),
    ]);

    expect(summary[0]?.label).toBe("full-price");
  });

  it("derives the discount from discountMinor when originalPriceMinor is absent", () => {
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Disc Only", 20)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        originalPriceMinor: undefined,
        productName: "Disc Only",
        amountMinor: 1000,
        discountMinor: 4000,
      }),
    ]);

    expect(summary[0]?.label).toBe("deep-sale");
  });

  it("attributes the base-game purchase through the spend matcher and ignores add-ons", () => {
    const summary = summarisePriceContext(
      Dashboard.data({ games: [game("Hades", 10, "PPSA01234_00")] }),
      [
        Transactions.row({
          skuType: undefined,
          discountMinor: undefined,
          productName: "Hades",
          skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
          amountMinor: 1599,
          originalPriceMinor: 1999,
        }),
        Transactions.row({
          skuId: undefined,
          skuType: undefined,
          discountMinor: undefined,
          productName: "Hades - Season Pass",
          amountMinor: 999,
          originalPriceMinor: 999,
        }),
      ]
    );

    expect(summary).toStrictEqual([
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
    const summary = summarisePriceContext(
      Dashboard.data({ games: [game("Cyberpunk 2077", 40, "PPSA01491_00")] }),
      [
        Transactions.row({
          discountMinor: undefined,
          productName: "Cyberpunk 2077: Phantom Liberty",
          skuType: "PRE_ORDER",
          skuId: "EP4082-PPSA01491_00-EXPANSION1000000-U001",
          amountMinor: 2499,
          originalPriceMinor: 2499,
        }),
        Transactions.row({
          productName: "Cyberpunk 2077",
          skuType: "STANDARD",
          skuId: "EP4082-PPSA01491_00-00000000000000N1-U001",
          amountMinor: 1999,
          originalPriceMinor: 3999,
          discountMinor: 2000,
        }),
      ]
    );

    expect(summary).toStrictEqual([
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
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Hades", 10)] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        discountMinor: undefined,
        productName: "Unknown Game",
        amountMinor: 1999,
        originalPriceMinor: 1999,
      }),
    ]);

    expect(summary).toStrictEqual([]);
  });

  it("keeps the first base-game purchase when a title was bought more than once", () => {
    const summary = summarisePriceContext(Dashboard.data({ games: [game("Twice", 10, "TW")] }), [
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        discountMinor: undefined,
        productName: "Twice",
        amountMinor: 1500,
        originalPriceMinor: 2000,
      }),
      Transactions.row({
        skuId: undefined,
        skuType: undefined,
        discountMinor: undefined,
        productName: "Twice",
        amountMinor: 500,
        originalPriceMinor: 2000,
      }),
    ]);

    expect(summary).toStrictEqual([
      {
        titleId: "TW",
        name: "Twice",
        label: "discounted",
        paidMinor: 1500,
        originalPriceMinor: 2000,
        currency: "£",
      },
    ]);
  });
});
