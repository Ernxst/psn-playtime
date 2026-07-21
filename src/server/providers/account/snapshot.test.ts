import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as Dashboard from "@/test/factories/dashboard";
import * as Psn from "@/test/factories/psn";
import { DashboardData, GamePlay, Genre, Platform } from "./snapshot";

const decodeData = Schema.decodeUnknownSync(DashboardData);
const encodeData = Schema.encodeSync(DashboardData);

/** A PSN-shaped title mapped to the snapshot boundary for per-field checks. */
const psnGame = Psn.playedTitle({
  titleId: "game-1",
  name: "Game One",
  category: "ps5_native_game",
  playDuration: "PT1H",
  playCount: 1,
});
const aGame = {
  titleId: psnGame.titleId,
  name: psnGame.name,
  platform: "PS5" as const,
  hours: 1,
  playCount: psnGame.playCount,
  genre: "Other" as const,
  isApp: false,
};

describe("snapshot schema", () => {
  it("round-trips a valid DashboardData through decode then encode", () => {
    const data = Dashboard.data();
    const decoded = decodeData(data);

    expect(encodeData(decoded)).toStrictEqual(data);
  });

  it("decodes a payload with optional fields omitted", () => {
    const data = Dashboard.data();
    const { aboutMe: _aboutMe, avatarUrl: _avatarUrl, ...leanProfile } = data.profile;
    const lean = { ...data, games: [], profile: leanProfile };

    const decoded = decodeData(lean);

    expect(decoded.games).toStrictEqual([]);
    expect(decoded).not.toHaveProperty("enriched");
    expect(decoded.profile).not.toHaveProperty("aboutMe");
  });

  it("defaults trophiesUnavailable to false when an old cached payload omits it", () => {
    const { trophiesUnavailable: _trophiesUnavailable, ...withoutFlag } = Dashboard.data();

    const decoded = decodeData(withoutFlag);

    expect(decoded.trophiesUnavailable).toBe(false);
  });

  it("rejects a payload missing a required field", () => {
    const { fetchedAt: _fetchedAt, ...withoutFetchedAt } = Dashboard.data();

    expect(() => decodeData(withoutFetchedAt)).toThrow(/fetchedAt/);
  });

  it("rejects a payload whose field has the wrong type", () => {
    const data = Dashboard.data();
    const badProfile = {
      ...data,
      profile: { ...data.profile, isPlus: "yes" },
    };

    expect(() => decodeData(badProfile)).toThrow(/isPlus/);
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
    expect(() => decodePlatform("PS2")).toThrow(/PS2/);
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
    expect(() => decodeGenre("Puzzle")).toThrow(/Puzzle/);
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
    expect(() => decodeGame({ ...aGame, platform: "PS2" })).toThrow(/PS2/);
  });

  it("rejects a title with a non-numeric hours value", () => {
    expect(() => decodeGame({ ...aGame, hours: "lots" })).toThrow(/lots/);
  });

  it("rejects a title with a non-finite hours value", () => {
    expect(() => decodeGame({ ...aGame, hours: Number.POSITIVE_INFINITY })).toThrow(/Infinity/);
  });
});
