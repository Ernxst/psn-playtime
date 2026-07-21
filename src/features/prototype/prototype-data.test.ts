import { describe, expect, it } from "vitest";
import { prototypeDemoDashboard, signedInPreviewDashboard } from "@/domain/mock";
import { prototypeDashboard } from "./prototype-data";

describe(".prototypeDashboard", () => {
  it("preserves the authoritative demo identity and trophies while adding presentation data", () => {
    const prototype = prototypeDashboard(prototypeDemoDashboard);

    expect(prototype.profile).toBe(prototypeDemoDashboard.profile);
    expect(prototype.games.map((game) => game.trophy)).toStrictEqual(
      prototypeDemoDashboard.games.map((game) => game.trophy)
    );
  });

  it("renders the authoritative signed-in preview as ordinary dashboard data", () => {
    const prototype = prototypeDashboard(signedInPreviewDashboard);

    expect(prototype.profile).toBe(signedInPreviewDashboard.profile);
    expect(prototype.games.map((game) => game.trophy)).toStrictEqual(
      signedInPreviewDashboard.games.map((game) => game.trophy)
    );
  });
});
