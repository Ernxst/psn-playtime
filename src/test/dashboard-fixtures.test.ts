import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { dashboardData } from "@/test/dashboard-fixtures";

describe(".dashboardData", () => {
  it("returns independent nested dashboard data", () => {
    const first = dashboardData();
    const second = dashboardData();

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

  it("clones nested override values", () => {
    const games = [demoDashboard.games[0]!];
    const first = dashboardData({ games });
    const second = dashboardData({ games });

    Object.assign(first.games[0]!.trophy!.earned, { silver: -1 });

    expect(second.games[0]?.trophy?.earned.silver).toBe(9);
    expect(games[0]?.trophy?.earned.silver).toBe(9);
  });
});
