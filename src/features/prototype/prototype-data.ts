import type { TransactionRow } from "@/domain/transactions";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";

export const prototypeTransactions: TransactionRow[] = [
  {
    transactionId: "playloom-1",
    key: "playloom-1-game",
    date: "2026-05-14T10:30:00.000Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Satisfactory",
    skuId: "DEMO-6-STANDARD",
    skuType: "STANDARD",
    quantity: 1,
    amountMinor: 3299,
    currency: "£",
    displayAmount: "£32.99",
    originalPriceMinor: 3999,
    discountMinor: 700,
  },
  {
    transactionId: "playloom-2",
    key: "playloom-2-game",
    date: "2025-11-02T15:12:00.000Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Cyberpunk 2077",
    skuId: "DEMO-8-STANDARD",
    skuType: "STANDARD",
    quantity: 1,
    amountMinor: 2499,
    currency: "£",
    displayAmount: "£24.99",
    originalPriceMinor: 4999,
    discountMinor: 2500,
  },
  {
    transactionId: "playloom-3",
    key: "playloom-3-addon",
    date: "2025-11-02T15:12:00.000Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Cyberpunk 2077 — Phantom Liberty expansion",
    skuId: "DEMO-8-EXPANSION",
    skuType: "ADD_ON",
    quantity: 1,
    amountMinor: 1999,
    currency: "£",
    displayAmount: "£19.99",
    originalPriceMinor: 2499,
    discountMinor: 500,
  },
  {
    transactionId: "playloom-4",
    key: "playloom-4-game",
    date: "2024-03-21T18:05:00.000Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName:
      "Grand Theft Auto V: Premium Edition, Criminal Enterprise Starter Pack and Great White Shark Card Bundle",
    skuId: "DEMO-5-BUNDLE",
    skuType: "BUNDLE",
    quantity: 1,
    amountMinor: 1799,
    currency: "£",
    displayAmount: "£17.99",
    originalPriceMinor: 3499,
    discountMinor: 1700,
  },
  {
    transactionId: "playloom-5",
    key: "playloom-5-unmatched",
    date: "2023-08-09T09:45:00.000Z",
    transactionType: "CYCLE_SUBSCRIPTION",
    kind: "purchase",
    productName: "PlayStation Plus Essential: 12 Month Subscription",
    skuType: "SUBSCRIPTION",
    quantity: 1,
    amountMinor: 5999,
    currency: "£",
    displayAmount: "£59.99",
    originalPriceMinor: 5999,
    discountMinor: 0,
  },
  {
    transactionId: "playloom-6",
    key: "playloom-6-topup",
    date: "2022-12-18T20:00:00.000Z",
    transactionType: "WALLET_FUNDING",
    kind: "top-up",
    productName: "Wallet funding",
    quantity: 1,
    amountMinor: 5000,
    currency: "£",
    displayAmount: "£50.00",
  },
];

const atlasSlots = ["city", "stadium", "snow", "blocks", "desert", "coast"] as const;
const validatedRawgFixtures = new Set([
  "DEMO-1",
  "DEMO-2",
  "DEMO-3",
  "DEMO-4",
  "DEMO-5",
  "DEMO-6",
  "DEMO-7",
  "DEMO-8",
  "DEMO-9",
  "DEMO-10",
  "DEMO-11",
  "DEMO-12",
  "DEMO-13",
  "DEMO-14",
  "DEMO-15",
  "DEMO-16",
]);

export type PosterSlot = (typeof atlasSlots)[number];

export function posterSlot(game: Pick<GamePlay, "titleId">): PosterSlot | undefined {
  if (!validatedRawgFixtures.has(game.titleId)) return undefined;
  const value = Array.from(game.titleId).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0
  );
  return atlasSlots[value % atlasSlots.length];
}

export function prototypeDashboard(data: DashboardData): DashboardData {
  return {
    ...data,
    games: data.games.map((game, index) => ({
      ...game,
      ...(index === 0 ? { imageUrl: "/playloom/psn-source.png" } : {}),
      ...(index % 4 === 0 ? { typicalPlaytime: Math.max(8, Math.round(game.hours / 4)) } : {}),
    })),
  };
}

export function safeSignedInDashboard(data: DashboardData): DashboardData {
  return {
    ...prototypeDashboard(data),
    profile: {
      ...data.profile,
      aboutMe: "Safe signed-in prototype profile — no token is accepted or transmitted.",
    },
    isDemo: false,
  };
}
