import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import * as Dashboard from "./dashboard";

describe(".data", () => {
  it("returns independent nested dashboard data", () => {
    const first = Dashboard.data();
    const second = Dashboard.data();

    expect(first.profile).not.toBe(second.profile);
    expect(first.profile.earned).not.toBe(second.profile.earned);
    expect(first.games).not.toBe(second.games);
    expect(first.games[0]).not.toBe(second.games[0]);
    expect(first.games[0]?.trophy).not.toBe(second.games[0]?.trophy);
    expect(first.games[0]?.trophy?.earned).not.toBe(second.games[0]?.trophy?.earned);
    expect(first.meta).not.toBe(second.meta);
    expect(first.meta.appsExcluded).not.toBe(second.meta.appsExcluded);
    expect(first.meta.appsExcluded[0]).not.toBe(second.meta.appsExcluded[0]);
    expect(first.meta.span).not.toBe(second.meta.span);

    Object.assign(first.profile, { onlineId: "mutated" });
    Object.assign(first.profile.earned, { platinum: -1 });
    Object.assign(first.games[0]!, { name: "mutated" });
    Object.assign(first.games[0]!.trophy!, { progress: -1 });
    Object.assign(first.games[0]!.trophy!.earned, { gold: -1 });
    Object.assign(first.meta, { totalGames: -1 });
    Object.assign(first.meta.appsExcluded[0]!, { name: "mutated" });
    Object.assign(first.meta.span, { from: "mutated" });

    expect(second).toStrictEqual(demoDashboard);
    expect(demoDashboard.profile.onlineId).toBe("Ernxst_");
    expect(demoDashboard.profile.earned.platinum).toBe(9);
    expect(demoDashboard.games[0]?.name).toBe("Call of Duty®: Modern Warfare®");
    expect(demoDashboard.games[0]?.trophy?.progress).toBe(68);
    expect(demoDashboard.games[0]?.trophy?.earned.gold).toBe(3);
    expect(demoDashboard.meta.totalGames).toBe(98);
    expect(demoDashboard.meta.appsExcluded[0]?.name).toBe("YouTube");
    expect(demoDashboard.meta.span.from).toBe("2017-06-26");
  });

  it("returns independent data without modifying nested overrides", () => {
    const profile = structuredClone(demoDashboard.profile);
    const games = structuredClone(demoDashboard.games);
    const meta = structuredClone(demoDashboard.meta);
    const overrides = {
      profile: { earned: profile.earned },
      games,
      meta: { appsExcluded: meta.appsExcluded, span: meta.span },
    };
    const expected = structuredClone(overrides);
    const first = Dashboard.data(overrides);
    const second = Dashboard.data(overrides);

    Object.assign(first.profile.earned, { silver: -1 });
    Object.assign(first.games[0]!.trophy!.earned, { silver: -1 });
    Object.assign(first.meta.appsExcluded[0]!, { name: "mutated" });
    Object.assign(first.meta.span, { from: "mutated" });

    expect(overrides).toStrictEqual(expected);
    expect(second.profile.earned).toStrictEqual(expected.profile.earned);
    expect(second.games).toStrictEqual(expected.games);
    expect(second.meta.appsExcluded).toStrictEqual(expected.meta.appsExcluded);
    expect(second.meta.span).toStrictEqual(expected.meta.span);
    expect(first.profile.earned).not.toBe(second.profile.earned);
    expect(first.games[0]?.trophy?.earned).not.toBe(second.games[0]?.trophy?.earned);
    expect(first.meta.appsExcluded).not.toBe(second.meta.appsExcluded);
    expect(first.meta.span).not.toBe(second.meta.span);
  });
});
