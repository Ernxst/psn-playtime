import type { ProfileFromUserNameResponse, TrophyTitle } from "psn-api";
import { describe, expect, it } from "vitest";
import {
  buildTrophyMap,
  computeMeta,
  partitionTitles,
  type PlayedTitle,
  toProfileSummary,
} from "./normalize";

type ProfileBody = ProfileFromUserNameResponse["profile"];
type AvatarUrl = ProfileBody["avatarUrls"][number];

const baseProfile: ProfileBody = {
  onlineId: "Ernxst_",
  accountId: "acc-1",
  npId: "np-1",
  avatarUrls: [{ size: "xl", avatarUrl: "https://img/xl" }],
  plus: 1,
  aboutMe: "Hello there",
  languagesUsed: ["en"],
  trophySummary: {
    level: 220,
    progress: 70,
    earnedTrophies: { bronze: 887, silver: 188, gold: 54, platinum: 9 },
  },
  isOfficiallyVerified: false,
  personalDetail: { firstName: "", lastName: "", profilePictureUrls: [] },
  personalDetailSharing: "no",
  personalDetailSharingRequestMessageFlag: false,
  primaryOnlineStatus: "offline",
  presences: [],
  friendRelation: "no-relation",
  requestMessageFlag: false,
  blocking: false,
  following: false,
  consoleAvailability: { availabilityStatus: "unavailable" },
};

function profile(overrides: Partial<ProfileBody> = {}): ProfileBody {
  return { ...baseProfile, ...overrides };
}

const basePlayed: PlayedTitle = {
  titleId: "title-1",
  name: "A Game",
  localizedName: "A Game",
  imageUrl: "https://img/game",
  localizedImageUrl: "https://img/game",
  category: "ps4_game",
  service: "none",
  playCount: 0,
  concept: { id: 0, titleIds: [], name: "", media: { audios: [], videos: [], images: [] } },
  media: {},
  firstPlayedDateTime: "",
  lastPlayedDateTime: "",
  playDuration: "PT0S",
};

function played(overrides: Partial<PlayedTitle>): PlayedTitle {
  return { ...basePlayed, ...overrides };
}

const baseTrophy: TrophyTitle = {
  npServiceName: "trophy",
  npCommunicationId: "",
  trophySetVersion: "01.00",
  trophyTitleName: "",
  trophyTitleIconUrl: "",
  trophyTitlePlatform: "PS4",
  hasTrophyGroups: false,
  definedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  progress: 0,
  earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  hiddenFlag: false,
  lastUpdatedDateTime: "",
};

function trophy(overrides: Partial<TrophyTitle>): TrophyTitle {
  return { ...baseTrophy, ...overrides };
}

/** The first (highest-hours) game produced for a single played title. */
function gameFor(
  title: PlayedTitle,
  trophies: TrophyTitle[] = []
): ReturnType<typeof partitionTitles>["games"][number] {
  return partitionTitles([title], buildTrophyMap(trophies)).games[0]!;
}

describe(".toProfileSummary", () => {
  it("normalises a profile body into the profile summary contract", () => {
    expect(toProfileSummary(profile())).toEqual({
      onlineId: "Ernxst_",
      accountId: "acc-1",
      aboutMe: "Hello there",
      avatarUrl: "https://img/xl",
      isPlus: true,
      trophyLevel: 220,
      levelProgress: 70,
      earned: { platinum: 9, gold: 54, silver: 188, bronze: 887 },
      totalTrophies: 1138,
    });
  });

  it("drops an empty about-me", () => {
    expect(toProfileSummary(profile({ aboutMe: "" })).aboutMe).toBeUndefined();
  });

  it.each<{ plus: 0 | 1; expected: boolean }>([
    { plus: 1, expected: true },
    { plus: 0, expected: false },
  ])("reads plus=$plus as isPlus=$expected", ({ plus, expected }) => {
    expect(toProfileSummary(profile({ plus })).isPlus).toBe(expected);
  });

  it.each<{ scenario: string; avatarUrls: AvatarUrl[]; expected: string | undefined }>([
    {
      scenario: "prefers the extra-large avatar",
      avatarUrls: [
        { size: "m", avatarUrl: "m" },
        { size: "xl", avatarUrl: "xl" },
        { size: "l", avatarUrl: "l" },
      ],
      expected: "xl",
    },
    {
      scenario: "falls back to large when no extra-large exists",
      avatarUrls: [
        { size: "m", avatarUrl: "m" },
        { size: "l", avatarUrl: "l" },
      ],
      expected: "l",
    },
    {
      scenario: "falls back to medium when only medium exists",
      avatarUrls: [{ size: "m", avatarUrl: "m" }],
      expected: "m",
    },
    {
      scenario: "falls back to the first url for an unrecognised size",
      avatarUrls: [{ size: "s", avatarUrl: "s" }],
      expected: "s",
    },
    {
      scenario: "yields no avatar for an empty url list",
      avatarUrls: [],
      expected: undefined,
    },
  ])("$scenario", ({ avatarUrls, expected }) => {
    expect(toProfileSummary(profile({ avatarUrls })).avatarUrl).toBe(expected);
  });
});

describe(".buildTrophyMap", () => {
  it("keys each list by its normalised matching name", () => {
    const map = buildTrophyMap([trophy({ trophyTitleName: "The Division®2", progress: 40 })]);

    expect(map.get("the division 2")?.progress).toBe(40);
  });

  it("keeps the more-progressed list when two stacks share a name", () => {
    const map = buildTrophyMap([
      trophy({ trophyTitleName: "Minecraft", progress: 30, trophyTitlePlatform: "PS4" }),
      trophy({ trophyTitleName: "Minecraft", progress: 80, trophyTitlePlatform: "PS5" }),
    ]);

    expect(map.get("minecraft")?.progress).toBe(80);
  });

  it("keeps distinct lists under distinct normalised keys", () => {
    const map = buildTrophyMap([
      trophy({ trophyTitleName: "Minecraft", progress: 30 }),
      trophy({ trophyTitleName: "Minecraft • Set 2", progress: 10 }),
    ]);

    expect(map.size).toBe(2);
  });
});

describe(".partitionTitles", () => {
  it("separates games from excluded apps and sorts each group by hours descending", () => {
    const result = partitionTitles(
      [
        played({ titleId: "short", name: "Short Game", playDuration: "PT2H" }),
        played({ titleId: "long", name: "Long Game", playDuration: "PT10H" }),
        played({ titleId: "yt", name: "YouTube", playDuration: "PT5H" }),
        played({ titleId: "nf", name: "Netflix", playDuration: "PT8H" }),
      ],
      new Map()
    );

    expect(result.games.map((g) => g.titleId)).toEqual(["long", "short"]);
    expect(result.appsExcluded).toEqual([
      { name: "Netflix", hours: 8 },
      { name: "YouTube", hours: 5 },
    ]);
  });

  it.each([
    {
      scenario: "derives PS5 from the category",
      category: "ps5_native_game",
      name: "X",
      expected: "PS5",
    },
    { scenario: "derives PS3 from the category", category: "ps3_game", name: "X", expected: "PS3" },
    {
      scenario: "derives PSVITA from the category",
      category: "psvita_game",
      name: "X",
      expected: "PSVITA",
    },
    {
      scenario: "falls back to the name when the category has no token",
      category: "unknown",
      name: "Some Game (PlayStation®4)",
      expected: "PS4",
    },
    {
      scenario: "yields OTHER when neither category nor name carries a token",
      category: "unknown",
      name: "Plain Title",
      expected: "OTHER",
    },
  ])("$scenario", ({ category, name, expected }) => {
    expect(gameFor(played({ category, name })).platform).toBe(expected);
  });

  it.each([
    { duration: "PT100H30M15S", hours: 100.5 },
    { duration: "PT90M", hours: 1.5 },
    { duration: "PT45S", hours: 0.01 },
    { duration: "PT0S", hours: 0 },
    { duration: "", hours: 0 },
    { duration: "not-a-duration", hours: 0 },
  ])("converts the duration $duration to $hours hours", ({ duration, hours }) => {
    expect(gameFor(played({ playDuration: duration })).hours).toBe(hours);
  });

  it.each([
    {
      scenario: "reduces a valid ISO timestamp to a date",
      value: "2020-01-01T10:00:00Z",
      expected: "2020-01-01",
    },
    { scenario: "drops an invalid timestamp", value: "not-a-date", expected: undefined },
    { scenario: "drops an empty timestamp", value: "", expected: undefined },
  ])("$scenario", ({ value, expected }) => {
    expect(gameFor(played({ firstPlayedDateTime: value })).firstPlayed).toBe(expected);
  });

  it("drops an empty image URL", () => {
    expect(gameFor(played({ imageUrl: "" })).imageUrl).toBeUndefined();
  });

  it("defaults the play count to zero when the field is absent", () => {
    expect(gameFor(played({ playCount: undefined })).playCount).toBe(0);
  });

  it("leaves every game un-enriched with a baseline genre and no franchise", () => {
    const game = gameFor(played({ name: "Call of Duty" }));

    expect(game.genre).toBe("Other");
    expect(game.franchise).toBeUndefined();
    expect(game.isApp).toBe(false);
  });

  it("attaches a matching trophy list to a game", () => {
    const game = gameFor(played({ name: "Call of Duty®: Modern Warfare®" }), [
      trophy({
        trophyTitleName: "Call of Duty Modern Warfare",
        progress: 90,
        definedTrophies: { bronze: 40, silver: 10, gold: 5, platinum: 1 },
        earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 1 },
        lastUpdatedDateTime: "2021-06-10T00:00:00Z",
      }),
    ]);

    expect(game.trophy).toEqual({
      progress: 90,
      earned: { platinum: 1, gold: 5, silver: 10, bronze: 20 },
      total: 36,
      hasPlatinum: true,
      lastEarnedAt: "2021-06-10T00:00:00Z",
    });
  });

  it("keeps platinum eligibility when the platinum is available but unearned", () => {
    const game = gameFor(played({ name: "Fresh Start" }), [
      trophy({
        trophyTitleName: "Fresh Start",
        progress: 80,
        definedTrophies: { bronze: 40, silver: 10, gold: 5, platinum: 1 },
        earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 0 },
      }),
    ]);

    expect(game.trophy).toMatchObject({
      earned: { platinum: 0, gold: 5, silver: 10, bronze: 20 },
      hasPlatinum: true,
    });
  });

  it("matches a trophy list via the concept name when the store name differs", () => {
    const game = gameFor(
      played({
        name: "GTAV Premium Edition",
        concept: { ...basePlayed.concept, name: "Grand Theft Auto V" },
      }),
      [trophy({ trophyTitleName: "Grand Theft Auto V", progress: 50 })]
    );

    expect(game.trophy?.progress).toBe(50);
  });

  it("matches a brand-prefixed trophy list via the trailing-token subset", () => {
    const game = gameFor(
      played({ name: "The Division 2", concept: { ...basePlayed.concept, name: "" } }),
      [trophy({ trophyTitleName: "Tom Clancy's The Division®2", progress: 65 })]
    );

    expect(game.trophy?.progress).toBe(65);
  });

  it("falls back to an empty concept name when the title has no concept", () => {
    const game = gameFor(played({ name: "Call of Duty", concept: undefined }), [
      trophy({ trophyTitleName: "Call of Duty", progress: 30 }),
    ]);

    expect(game.trophy?.progress).toBe(30);
  });

  it("leaves a game without a trophy when no candidate matches", () => {
    const game = gameFor(played({ name: "Unmatched Title" }), [
      trophy({ trophyTitleName: "A Different Game", progress: 10 }),
    ]);

    expect(game.trophy).toBeUndefined();
  });

  it("omits the last-earned date when no trophies have been earned", () => {
    const game = gameFor(played({ name: "Fresh Start" }), [
      trophy({
        trophyTitleName: "Fresh Start",
        progress: 0,
        lastUpdatedDateTime: "2021-06-10T00:00:00Z",
      }),
    ]);

    expect(game.trophy).toEqual({
      progress: 0,
      earned: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      total: 0,
      hasPlatinum: false,
      lastEarnedAt: undefined,
    });
  });

  it.each([
    { scenario: "by the media-app category", name: "Some App", category: "ps4_native_media_app" },
    { scenario: "by an _app category suffix", name: "Some App", category: "music_app" },
    { scenario: "by a streaming app name", name: "Spotify", category: "ps4_game" },
  ])("excludes a non-game app $scenario", ({ name, category }) => {
    const result = partitionTitles([played({ name, category })], new Map());

    expect(result.games).toEqual([]);
    expect(result.appsExcluded.map((a) => a.name)).toEqual([name]);
  });

  it("keeps a game whose name only contains an app word at a non-boundary", () => {
    const result = partitionTitles([played({ name: "Mad Max", category: "ps4_game" })], new Map());

    expect(result.games.map((g) => g.titleId)).toEqual(["title-1"]);
    expect(result.appsExcluded).toEqual([]);
  });
});

describe(".computeMeta", () => {
  it("aggregates totals, sessions and the activity span across games", () => {
    const { games, appsExcluded } = partitionTitles(
      [
        played({
          name: "Early Game",
          playDuration: "PT5H",
          playCount: 3,
          firstPlayedDateTime: "2019-01-01T00:00:00Z",
          lastPlayedDateTime: "2020-01-01T00:00:00Z",
        }),
        played({
          name: "Late Game",
          playDuration: "PT2H30M",
          playCount: 4,
          firstPlayedDateTime: "2021-05-05T00:00:00Z",
          lastPlayedDateTime: "2022-12-31T00:00:00Z",
        }),
      ],
      new Map()
    );

    expect(computeMeta(games, appsExcluded)).toEqual({
      totalGames: 2,
      totalHours: 7.5,
      totalSessions: 7,
      appsExcluded: [],
      firstEverPlayed: "2019-01-01",
      span: { from: "2019-01-01", to: "2022-12-31" },
    });
  });

  it("leaves the activity span open when no play dates are present", () => {
    const { games, appsExcluded } = partitionTitles([played({ name: "Undated Game" })], new Map());

    const meta = computeMeta(games, appsExcluded);

    expect(meta.firstEverPlayed).toBeUndefined();
    expect(meta.span).toEqual({ from: undefined, to: undefined });
  });
});
