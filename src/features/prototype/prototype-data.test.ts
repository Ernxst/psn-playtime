import { describe, expect, it } from "vitest";
import { prototypeDemoDashboard, signedInPreviewDashboard } from "@/domain/mock";
import { prototypeDashboard } from "./prototype-data";

describe(".prototypeDashboard", () => {
  it("preserves the authoritative demo identity and presentation artwork", () => {
    const prototype = prototypeDashboard(prototypeDemoDashboard);

    expect(prototype.profile).toBe(prototypeDemoDashboard.profile);
    expect(prototype.games.map((game) => game.trophy)).toStrictEqual(
      prototypeDemoDashboard.games.map((game) => game.trophy)
    );
    expect(prototype.games[0]?.imageUrl).toBe("/playloom/psn-source.png");
    expect(prototype.games[0]?.typicalPlaytime).toBe(
      Math.max(8, Math.round(prototypeDemoDashboard.games[0]!.hours / 4))
    );
  });

  it("leaves imported source artwork and missing enrichment unchanged", () => {
    const sourceImageUrl = "https://image.api.playstation.com/source-artwork.png";
    const imported = {
      ...signedInPreviewDashboard,
      games: [{ ...signedInPreviewDashboard.games[0]!, imageUrl: sourceImageUrl }],
    };

    const prototype = prototypeDashboard(imported);

    expect(prototype).toBe(imported);
    expect(prototype.games[0]?.imageUrl).toBe(sourceImageUrl);
    expect(prototype.games[0]).not.toHaveProperty("typicalPlaytime");
  });
});
