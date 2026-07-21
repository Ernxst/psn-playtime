import { signedInPreviewDashboard } from "@/domain/mock";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import type { DashboardStore } from "@/stores/dashboard-store";

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

function withPrototypeArtwork(games: readonly GamePlay[]): GamePlay[] {
  return games.map((game, index) => ({
    ...game,
    ...(index === 0 ? { imageUrl: "/playloom/psn-source.png" } : {}),
    ...(index % 4 === 0 ? { typicalPlaytime: Math.max(8, Math.round(game.hours / 4)) } : {}),
  }));
}

export function prototypeDashboard(data: DashboardData): DashboardData {
  return { ...data, games: withPrototypeArtwork(data.games) };
}

/** Seed the signed-in prototype once, then respect the user's selected account. */
export function activateSignedInPreview(store: DashboardStore): void {
  const previewId = signedInPreviewDashboard.profile.accountId;
  if (store.load(previewId) !== null) return;
  store.save(signedInPreviewDashboard);
  store.setActive(previewId);
}
