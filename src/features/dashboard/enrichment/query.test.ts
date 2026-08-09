import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import type { DashboardData, GamePlay } from "@/server/providers/account/snapshot";
import {
  enrichmentForSnapshot,
  enrichmentViewState,
  rawgFranchisesQueryOptions,
  rawgGenresQueryOptions,
  settledEnrichmentState,
} from "./query";

function game(overrides: Partial<GamePlay> = {}): GamePlay {
  return {
    titleId: "t",
    name: "Title",
    platform: "PS5",
    hours: 1,
    playCount: 1,
    category: "ps5_native_game",
    genre: "Other",
    isApp: false,
    ...overrides,
  };
}

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ...demoDashboard,
    profile: { ...demoDashboard.profile, accountId: "imported" },
    isDemo: false,
    enriched: false,
    games: [game()],
    ...overrides,
  };
}

describe("RAWG query options", () => {
  it("scopes an unresolved lookup to the active account, snapshot, and title ids", () => {
    const accountA = data({ fetchedAt: "2026-08-09T10:00:00Z" });
    const accountB = data({
      profile: { ...demoDashboard.profile, accountId: "other" },
      fetchedAt: "2026-08-09T10:00:00Z",
    });

    expect(rawgGenresQueryOptions(accountA).queryKey).toStrictEqual([
      "dashboard",
      "imported",
      "rawg-genres",
      "2026-08-09T10:00:00Z",
      ["t"],
    ]);
    expect(rawgGenresQueryOptions(accountB).queryKey).not.toStrictEqual(
      rawgGenresQueryOptions(accountA).queryKey
    );
  });

  it("does not re-run a completed domain but retries partial and failed outcomes after reload", () => {
    const snapshot = data();
    const complete = {
      fetchedAt: snapshot.fetchedAt,
      genres: "complete",
      franchises: "partial",
    } as const;
    const partial = {
      fetchedAt: snapshot.fetchedAt,
      genres: "partial",
      franchises: "failed",
    } as const;

    expect(rawgGenresQueryOptions(snapshot, complete).enabled).toBe(false);
    expect(rawgFranchisesQueryOptions(snapshot, complete).enabled).toBe(true);
    expect(rawgGenresQueryOptions(snapshot, partial).enabled).toBe(true);
    expect(rawgFranchisesQueryOptions(snapshot, partial).enabled).toBe(true);
  });

  it("retries a legacy enriched flag when its imported game still lacks metadata", () => {
    expect(rawgGenresQueryOptions(data({ enriched: true })).enabled).toBe(true);
  });

  it("does not treat a prior account snapshot outcome as current", () => {
    const fresh = data({ fetchedAt: "newer" });
    const stale = { fetchedAt: "older", genres: "complete", franchises: "complete" } as const;

    expect(enrichmentForSnapshot(fresh, stale)).toBeNull();
    expect(rawgGenresQueryOptions(fresh, enrichmentForSnapshot(fresh, stale)).enabled).toBe(true);
  });
});

describe(".enrichmentViewState", () => {
  it("keeps no-key, no-match, and upstream failure distinct", () => {
    const snapshot = data();

    expect(
      enrichmentViewState(snapshot, null, {
        genres: { status: "success", outcome: "unavailable" },
        franchises: { status: "success", outcome: "unavailable" },
      })
    ).toStrictEqual({ genres: "unavailable", franchises: "unavailable" });
    expect(
      enrichmentViewState(snapshot, null, {
        genres: { status: "success", outcome: "partial" },
        franchises: { status: "success", outcome: "partial" },
      })
    ).toStrictEqual({ genres: "partial", franchises: "partial" });
    expect(
      enrichmentViewState(snapshot, null, {
        genres: { status: "error", outcome: undefined },
        franchises: { status: "error", outcome: undefined },
      })
    ).toStrictEqual({ genres: "failed", franchises: "failed" });
  });

  it("only settles complete, partial, unavailable, or failed results", () => {
    expect(settledEnrichmentState("now", { genres: "pending", franchises: "complete" })).toBeNull();
    expect(
      settledEnrichmentState("now", { genres: "partial", franchises: "failed" })
    ).toStrictEqual({
      fetchedAt: "now",
      genres: "partial",
      franchises: "failed",
    });
  });
});
