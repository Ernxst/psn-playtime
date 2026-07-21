import { describe, expect, it } from "vitest";
import {
  createPsnAuthTokens,
  createPsnTokenResponse,
  psnPlayedPage,
  psnPlayedTitle,
  psnProfile,
  psnTrophyPage,
  psnTrophyTitle,
} from "./psn-fixtures";

describe("PSN response factories", () => {
  it("returns fresh auth responses", () => {
    const firstTokens = createPsnAuthTokens();
    const secondTokens = createPsnAuthTokens();
    const firstResponse = createPsnTokenResponse();
    const secondResponse = createPsnTokenResponse();

    firstTokens.accessToken = "changed";
    firstResponse.access_token = "changed";

    expect(secondTokens.accessToken).toBe("access-token");
    expect(secondResponse.access_token).toBe("access-token");
  });

  it("returns profiles with independent nested members", () => {
    const first = psnProfile();
    const second = psnProfile();

    first.profile.avatarUrls[0]!.avatarUrl = "https://img/changed";

    expect(second.profile.avatarUrls[0]!.avatarUrl).toBe("https://img/xl");
  });

  it("returns played titles with independent nested members", () => {
    const first = psnPlayedTitle({});
    const second = psnPlayedTitle({});

    first.concept.titleIds.push("changed");

    expect(second.concept.titleIds).toEqual([]);
  });

  it("returns trophy titles with independent nested members", () => {
    const first = psnTrophyTitle({});
    const second = psnTrophyTitle({});

    first.earnedTrophies.bronze = 1;

    expect(second.earnedTrophies.bronze).toBe(0);
  });

  it("returns played pages with independent nested members", () => {
    const title = psnPlayedTitle({ titleId: "game-1" });
    const first = psnPlayedPage([title]);
    const second = psnPlayedPage([title]);

    first.titles[0]!.concept.titleIds.push("changed");

    expect(second.titles[0]!.concept.titleIds).toEqual([]);
  });

  it("returns trophy pages with independent nested members", () => {
    const title = psnTrophyTitle({ trophyTitleName: "Game One" });
    const first = psnTrophyPage([title]);
    const second = psnTrophyPage([title]);

    first.trophyTitles[0]!.earnedTrophies.bronze = 1;

    expect(second.trophyTitles[0]!.earnedTrophies.bronze).toBe(0);
  });
});
