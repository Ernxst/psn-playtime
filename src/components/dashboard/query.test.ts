import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/lib/psn/mock";
import type { DashboardData, GamePlay } from "@/lib/psn/types";
import { rawgFranchisesQueryOptions, rawgGenresQueryOptions } from "./query";

function game(overrides: Partial<GamePlay> = {}): GamePlay {
  return {
    titleId: "t",
    name: "Title",
    platform: "PS5",
    hours: 1,
    playCount: 1,
    category: "ps5_native_game",
    genre: "Shooter",
    franchise: "Series",
    isApp: false,
    ...overrides,
  };
}

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return { ...demoDashboard, isDemo: false, enriched: false, games: [game()], ...overrides };
}

describe(".rawgGenresQueryOptions", () => {
  it("enables the lookup for an unenriched account with an Other-genre game", () => {
    expect(rawgGenresQueryOptions(data({ games: [game({ genre: "Other" })] })).enabled).toBe(true);
  });

  it("disables the lookup for demo data", () => {
    expect(
      rawgGenresQueryOptions(data({ isDemo: true, games: [game({ genre: "Other" })] })).enabled
    ).toBe(false);
  });

  it("disables the lookup once the data is enriched", () => {
    expect(
      rawgGenresQueryOptions(data({ enriched: true, games: [game({ genre: "Other" })] })).enabled
    ).toBe(false);
  });

  it("disables the lookup when no game needs a genre", () => {
    expect(rawgGenresQueryOptions(data({ games: [game({ genre: "Shooter" })] })).enabled).toBe(
      false
    );
  });

  it("keys the query by the data's fetch time", () => {
    expect(rawgGenresQueryOptions(data({ fetchedAt: "2020-01-01" })).queryKey).toEqual([
      "dashboard",
      "rawg-genres",
      "2020-01-01",
    ]);
  });
});

describe(".rawgFranchisesQueryOptions", () => {
  it("enables the lookup for an unenriched account with a franchise-less game", () => {
    expect(
      rawgFranchisesQueryOptions(data({ games: [game({ franchise: undefined })] })).enabled
    ).toBe(true);
  });

  it("disables the lookup for demo data", () => {
    expect(
      rawgFranchisesQueryOptions(data({ isDemo: true, games: [game({ franchise: undefined })] }))
        .enabled
    ).toBe(false);
  });

  it("disables the lookup once the data is enriched", () => {
    expect(
      rawgFranchisesQueryOptions(data({ enriched: true, games: [game({ franchise: undefined })] }))
        .enabled
    ).toBe(false);
  });

  it("disables the lookup when every game already has a franchise", () => {
    expect(
      rawgFranchisesQueryOptions(data({ games: [game({ franchise: "Series" })] })).enabled
    ).toBe(false);
  });

  it("keys the query by the data's fetch time", () => {
    expect(rawgFranchisesQueryOptions(data({ fetchedAt: "2020-01-01" })).queryKey).toEqual([
      "dashboard",
      "rawg-franchises",
      "2020-01-01",
    ]);
  });
});
