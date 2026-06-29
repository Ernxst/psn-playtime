import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { DashboardData, GamePlay, Genre, Platform } from "./snapshot";

const decodeData = Schema.decodeUnknownSync(DashboardData);
const encodeData = Schema.encodeSync(DashboardData);

/** A realistic title from the demo fixture for per-field GamePlay checks. */
const aGame = demoDashboard.games[0];

describe("snapshot schema", () => {
  it("round-trips a valid DashboardData through decode then encode", () => {
    const decoded = decodeData(demoDashboard);

    expect(encodeData(decoded)).toEqual(demoDashboard);
  });

  it("decodes a payload with optional fields omitted", () => {
    const { aboutMe: _aboutMe, avatarUrl: _avatarUrl, ...leanProfile } = demoDashboard.profile;
    const lean = { ...demoDashboard, games: [], profile: leanProfile };

    const decoded = decodeData(lean);

    expect(decoded.games).toEqual([]);
    expect(decoded).not.toHaveProperty("enriched");
    expect(decoded.profile).not.toHaveProperty("aboutMe");
  });

  it("rejects a payload missing a required field", () => {
    const { fetchedAt: _fetchedAt, ...withoutFetchedAt } = demoDashboard;

    expect(() => decodeData(withoutFetchedAt)).toThrow();
  });

  it("rejects a payload whose field has the wrong type", () => {
    const badProfile = {
      ...demoDashboard,
      profile: { ...demoDashboard.profile, isPlus: "yes" },
    };

    expect(() => decodeData(badProfile)).toThrow();
  });
});

describe("Platform", () => {
  const decodePlatform = Schema.decodeUnknownSync(Platform);

  it.each(["PS5", "PS4", "PS3", "PSVITA", "OTHER"] as const)(
    "accepts the platform member %s",
    (member) => {
      expect(decodePlatform(member)).toBe(member);
    }
  );

  it("rejects an unknown platform string", () => {
    expect(() => decodePlatform("PS2")).toThrow();
  });
});

describe("Genre", () => {
  const decodeGenre = Schema.decodeUnknownSync(Genre);

  it.each(["Shooter", "Sports", "RPG", "Racing", "Other"] as const)(
    "accepts the genre member %s",
    (member) => {
      expect(decodeGenre(member)).toBe(member);
    }
  );

  it("rejects an unknown genre string", () => {
    expect(() => decodeGenre("Puzzle")).toThrow();
  });
});

describe("GamePlay", () => {
  const decodeGame = Schema.decodeUnknownSync(GamePlay);

  it("decodes a title with all optional enrichment omitted", () => {
    const bare = {
      titleId: "T-1",
      name: "Bare Title",
      platform: "PS5",
      hours: 1,
      playCount: 1,
      genre: "Other",
      isApp: false,
    };

    const decoded = decodeGame(bare);

    expect(decoded).toMatchObject({ titleId: "T-1", genre: "Other" });
    expect(decoded).not.toHaveProperty("trophy");
  });

  it("rejects a title with an invalid platform", () => {
    expect(() => decodeGame({ ...aGame, platform: "PS2" })).toThrow();
  });

  it("rejects a title with a non-numeric hours value", () => {
    expect(() => decodeGame({ ...aGame, hours: "lots" })).toThrow();
  });
});
