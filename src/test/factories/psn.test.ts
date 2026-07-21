import { describe, expect, it } from "vitest";
import * as Psn from "./psn";

describe(".authTokens", () => {
  it("applies overrides to fresh responses", () => {
    const first = Psn.authTokens({ accessToken: "override" });
    const second = Psn.authTokens();

    expect(first.accessToken).toBe("override");
    expect(first).not.toBe(second);
    expect(second.accessToken).toBe("access-token");
  });
});

describe(".tokenResponse", () => {
  it("applies overrides to fresh responses", () => {
    const first = Psn.tokenResponse({ access_token: "override" });
    const second = Psn.tokenResponse();

    expect(first.access_token).toBe("override");
    expect(first).not.toBe(second);
    expect(second.access_token).toBe("access-token");
  });
});

describe(".profile", () => {
  it("clones nested overrides for every call", () => {
    const trophySummary = Psn.profile().profile.trophySummary;
    const overrides = {
      avatarUrls: [{ size: "xl", avatarUrl: "https://img/override" }],
      trophySummary,
    };
    const input = structuredClone(overrides);
    const first = Psn.profile(overrides);
    const second = Psn.profile(overrides);

    first.profile.avatarUrls[0]!.avatarUrl = "changed";
    first.profile.trophySummary.earnedTrophies.bronze = 0;

    expect(first).not.toBe(second);
    expect(first.profile).not.toBe(second.profile);
    expect(first.profile.avatarUrls).not.toBe(overrides.avatarUrls);
    expect(first.profile.avatarUrls[0]).not.toBe(second.profile.avatarUrls[0]);
    expect(first.profile.trophySummary).not.toBe(trophySummary);
    expect(first.profile.trophySummary.earnedTrophies).not.toBe(
      second.profile.trophySummary.earnedTrophies
    );
    expect(second.profile.avatarUrls[0]!.avatarUrl).toBe("https://img/override");
    expect(second.profile.trophySummary.earnedTrophies.bronze).toBe(887);
    expect(overrides).toEqual(input);
  });
});

describe(".playedTitle", () => {
  it("clones representative nested override paths for every call", () => {
    const concept = Psn.playedTitle().concept;
    concept.titleIds.push("caller-owned");
    const first = Psn.playedTitle({ concept });
    const second = Psn.playedTitle({ concept });

    first.concept.titleIds.push("changed");
    first.concept.media.images.push({ url: "changed", format: "unknown", type: "image" });

    expect(first).not.toBe(second);
    expect(first.concept).not.toBe(concept);
    expect(first.concept).not.toBe(second.concept);
    expect(first.concept.titleIds).not.toBe(concept.titleIds);
    expect(first.concept.titleIds).not.toBe(second.concept.titleIds);
    expect(first.concept.media).not.toBe(second.concept.media);
    expect(first.concept.media.images).not.toBe(second.concept.media.images);
    expect(second.concept.titleIds).toEqual(["caller-owned"]);
    expect(concept.titleIds).toEqual(["caller-owned"]);
  });
});

describe(".trophyTitle", () => {
  it("clones nested overrides for every call", () => {
    const earnedTrophies = { bronze: 1, silver: 2, gold: 3, platinum: 1 } as const;
    const first = Psn.trophyTitle({ earnedTrophies });
    const second = Psn.trophyTitle({ earnedTrophies });

    first.earnedTrophies.bronze = 99;

    expect(first).not.toBe(second);
    expect(first.earnedTrophies).not.toBe(earnedTrophies);
    expect(first.earnedTrophies).not.toBe(second.earnedTrophies);
    expect(second.earnedTrophies.bronze).toBe(1);
    expect(earnedTrophies.bronze).toBe(1);
  });
});

describe(".playedPage", () => {
  it("returns independent pages without modifying caller-owned titles", () => {
    const title = Psn.playedTitle({ titleId: "game-1" });
    const titles = [title];
    const input = structuredClone(titles);
    const first = Psn.playedPage(titles);
    const second = Psn.playedPage(titles);

    first.titles[0]!.concept.titleIds.push("changed");

    expect(first).not.toBe(second);
    expect(first.titles).not.toBe(titles);
    expect(first.titles).not.toBe(second.titles);
    expect(first.titles[0]).not.toBe(title);
    expect(first.titles[0]).not.toBe(second.titles[0]);
    expect(first.titles[0]!.concept).not.toBe(second.titles[0]!.concept);
    expect(second.titles[0]!.concept.titleIds).toEqual([]);
    expect(titles).toEqual(input);
  });
});

describe(".trophyPage", () => {
  it("returns independent pages without modifying caller-owned titles", () => {
    const title = Psn.trophyTitle({ trophyTitleName: "Game One" });
    const trophyTitles = [title];
    const input = structuredClone(trophyTitles);
    const first = Psn.trophyPage(trophyTitles);
    const second = Psn.trophyPage(trophyTitles);

    first.trophyTitles[0]!.earnedTrophies.bronze = 99;

    expect(first).not.toBe(second);
    expect(first.trophyTitles).not.toBe(trophyTitles);
    expect(first.trophyTitles).not.toBe(second.trophyTitles);
    expect(first.trophyTitles[0]).not.toBe(title);
    expect(first.trophyTitles[0]).not.toBe(second.trophyTitles[0]);
    expect(first.trophyTitles[0]!.earnedTrophies).not.toBe(second.trophyTitles[0]!.earnedTrophies);
    expect(second.trophyTitles[0]!.earnedTrophies.bronze).toBe(0);
    expect(trophyTitles).toEqual(input);
  });
});
