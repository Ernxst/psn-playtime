import type { QueryStatus } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import {
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
  shouldPersistEnrichment,
} from "./query";

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
    expect(rawgGenresQueryOptions(data({ fetchedAt: "2020-01-01" })).queryKey).toStrictEqual([
      "dashboard",
      "rawg-genres",
      "2020-01-01",
    ]);
  });

  it("never lets the lookup go stale", () => {
    expect(rawgGenresQueryOptions(data()).staleTime).toBe(Infinity);
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
    expect(rawgFranchisesQueryOptions(data({ fetchedAt: "2020-01-01" })).queryKey).toStrictEqual([
      "dashboard",
      "rawg-franchises",
      "2020-01-01",
    ]);
  });

  it("never lets the lookup go stale", () => {
    expect(rawgFranchisesQueryOptions(data()).staleTime).toBe(Infinity);
  });
});

describe(".shouldPersistEnrichment", () => {
  const enrichable = data({
    games: [game({ genre: "Other", franchise: undefined })],
  });

  it("does not persist demo data", () => {
    expect(shouldPersistEnrichment(data({ isDemo: true }), "success", "success")).toBe(false);
  });

  it("does not persist data that is already enriched", () => {
    expect(shouldPersistEnrichment(data({ enriched: true }), "success", "success")).toBe(false);
  });

  it("does not persist while a needed lookup errored, so a later visit retries", () => {
    expect(shouldPersistEnrichment(enrichable, "error", "success")).toBe(false);
  });

  it("does not persist while a needed lookup is still pending", () => {
    expect(shouldPersistEnrichment(enrichable, "pending", "success")).toBe(false);
  });

  it.each<[QueryStatus, QueryStatus]>([
    ["error", "error"],
    ["error", "pending"],
    ["success", "error"],
    ["success", "pending"],
  ])(
    "does not persist when genres is %s and franchises is %s",
    (genresStatus, franchisesStatus) => {
      expect(shouldPersistEnrichment(enrichable, genresStatus, franchisesStatus)).toBe(false);
    }
  );

  it("persists once both needed lookups have succeeded", () => {
    expect(shouldPersistEnrichment(enrichable, "success", "success")).toBe(true);
  });

  it("persists a succeeded lookup while the unneeded one is ignored", () => {
    expect(
      shouldPersistEnrichment(data({ games: [game({ genre: "Other" })] }), "success", "pending")
    ).toBe(true);
  });

  it("persists immediately when neither lookup is needed", () => {
    expect(shouldPersistEnrichment(data(), "pending", "pending")).toBe(true);
  });
});
