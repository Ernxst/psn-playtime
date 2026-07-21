import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpResponse, http } from "msw";
import type {
  ProfileFromUserNameResponse,
  TrophyTitle,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInEffect } from "@/server/api/account.effect";
import { PsnDashboardSourceLayer } from "@/server/providers/account/psn/provider.effect";
import { PsnTransportLive } from "@/server/providers/account/psn/transport.effect";
import type { DashboardData } from "@/server/providers/account/snapshot";
import * as Psn from "@/test/factories/psn";
import { server } from "@/test/msw";
import { psnApiUrl, psnAuthUrl, psnProfileUrl } from "@/test/msw-handlers";

/**
 * Run the exported `signInEffect` through the production PSN provider and live
 * `psn-api` transport. MSW owns only the remote PlayStation HTTP responses.
 */
function runSignIn(npsso: string): Promise<DashboardData> {
  const source = Layer.provide(PsnDashboardSourceLayer, PsnTransportLive);
  return Effect.runPromise(Effect.provide(signInEffect(Redacted.make(npsso)), source));
}

const basePlayed = Psn.playedTitle({});

const playedTitles: Psn.PlayedTitle[] = [
  Psn.playedTitle({
    titleId: "cod",
    name: "Call of Duty®: Modern Warfare®",
    imageUrl: "https://img/cod",
    playDuration: "PT100H30M15S",
    playCount: 5,
    firstPlayedDateTime: "2020-01-01T10:00:00Z",
    lastPlayedDateTime: "2021-06-01T10:00:00Z",
  }),
  Psn.playedTitle({
    titleId: "d2",
    name: "Destiny 2",
    category: "ps5_native_game",
    imageUrl: "https://img/d2",
    playDuration: "PT10H",
    playCount: 2,
    firstPlayedDateTime: "2019-01-01T10:00:00Z",
    lastPlayedDateTime: "2019-06-01T10:00:00Z",
  }),
  withoutPlayCount(
    Psn.playedTitle({
      titleId: "unknown",
      name: "Totally Unknown Title",
      // Empty strings exercise the falsy duration/date guards (→ 0 hours, no date).
      imageUrl: "",
      playDuration: "",
      firstPlayedDateTime: "",
      lastPlayedDateTime: "not-a-real-date",
    })
  ),
  Psn.playedTitle({
    titleId: "weird",
    name: "Weird Game",
    // Non-matching duration string exercises the regex-miss path.
    playDuration: "GARBAGE",
    playCount: 1,
    firstPlayedDateTime: "2022-01-01T10:00:00Z",
    lastPlayedDateTime: "2022-02-01T10:00:00Z",
  }),
  Psn.playedTitle({
    titleId: "netflix",
    name: "Netflix",
    category: "ps4_native_media_app",
    playDuration: "PT3H",
    playCount: 9,
  }),
  Psn.playedTitle({
    titleId: "shorty",
    name: "Short Session Title",
    category: "ps5_native_game",
    // No hours component: exercises the minutes/seconds-only duration path.
    playDuration: "PT45M30S",
    playCount: 3,
    firstPlayedDateTime: "2023-01-01T10:00:00Z",
    lastPlayedDateTime: "2023-02-01T10:00:00Z",
  }),
  Psn.playedTitle({
    titleId: "spotify",
    name: "Spotify",
    category: "ps4_native_media_app",
    // Second excluded app so the apps-sort comparator runs.
    playDuration: "PT1H30M",
    playCount: 4,
  }),
];

const trophyTitles: TrophyTitle[] = [
  Psn.trophyTitle({
    trophyTitleName: "Call of Duty Modern Warfare",
    progress: 40,
    earnedTrophies: { bronze: 3, silver: 2, gold: 1, platinum: 0 },
    lastUpdatedDateTime: "2021-05-01T00:00:00Z",
  }),
  Psn.trophyTitle({
    trophyTitleName: "Call of Duty: Modern Warfare!",
    progress: 90,
    definedTrophies: { bronze: 40, silver: 10, gold: 5, platinum: 1 },
    earnedTrophies: { bronze: 20, silver: 10, gold: 5, platinum: 1 },
    lastUpdatedDateTime: "2021-06-10T00:00:00Z",
  }),
  Psn.trophyTitle({
    // Lower-progress collision: must be skipped in favour of the 90% entry.
    trophyTitleName: "Call of Duty - Modern Warfare",
    progress: 10,
    earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
    lastUpdatedDateTime: "2020-01-01T00:00:00Z",
  }),
  Psn.trophyTitle({
    trophyTitleName: "Destiny 2",
    progress: 0,
    earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    lastUpdatedDateTime: "2019-01-01T00:00:00Z",
  }),
];

/**
 * Drop the (type-required) `totalItemCount` so a page exercises the defensive
 * page-fullness pagination fallback — the PSN API can omit it in practice.
 */
function withoutTotal<T extends { totalItemCount: number }>(page: T): T {
  return { ...page, totalItemCount: undefined } as T;
}

/** Drop the (type-required) `playCount` to model a never-fully-launched title. */
function withoutPlayCount<T extends { playCount: number }>(title: T): T {
  return { ...title, playCount: undefined } as T;
}

/**
 * Override PlayStation's remote responses. Paged fixtures are selected by the
 * request offset, so the real SDK adapter and pagination path remain exercised.
 */
function mockPsn(
  cfg: {
    authorize?: "reject";
    profile?: ProfileFromUserNameResponse;
    profileError?: string;
    played?: UserPlayedGamesResponse[];
    titles?: UserTitlesResponse[];
    trophiesUnavailable?: boolean;
  } = {}
) {
  const playedPages = cfg.played ?? [];
  const titlePages = cfg.titles ?? [];
  const getPlayedGames = vi.fn(({ request }: { request: Request }) => {
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    const page =
      playedPages.find((_, index) => {
        const previous = playedPages.slice(0, index);
        const consumed = previous.reduce((sum, item) => sum + item.titles.length, 0);
        return consumed === offset;
      }) ?? Psn.playedPage([], 0);
    return HttpResponse.json(page);
  });
  const getUserTitles = cfg.trophiesUnavailable
    ? vi.fn(() => HttpResponse.error())
    : vi.fn(({ request }: { request: Request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
        const page =
          titlePages.find((_, index) => {
            const previous = titlePages.slice(0, index);
            const consumed = previous.reduce((sum, item) => sum + item.trophyTitles.length, 0);
            return consumed === offset;
          }) ?? Psn.trophyPage([], 0);
        return HttpResponse.json(page);
      });
  const handlers = [
    http.get(
      psnAuthUrl("authorize"),
      () =>
        new HttpResponse(null, {
          status: cfg.authorize === "reject" ? 200 : 302,
          headers:
            cfg.authorize === "reject"
              ? {}
              : { Location: "https://example.test/redirect/?code=access-code" },
        })
    ),
    http.get(psnProfileUrl("users/me/profile2"), () =>
      HttpResponse.json(
        cfg.profileError ? { error: { message: cfg.profileError } } : (cfg.profile ?? Psn.profile())
      )
    ),
    http.get(psnApiUrl("gamelist/v2/users/me/titles"), getPlayedGames),
    http.get(psnApiUrl("trophy/v1/users/me/trophyTitles"), getUserTitles),
  ];
  return { handlers, getPlayedGames, getUserTitles };
}

/** Handlers for a successful live build with the shared fixtures, spread across two pages each. */
function liveHandlers(profileResult: ProfileFromUserNameResponse = Psn.profile()) {
  return mockPsn({
    profile: profileResult,
    // Two pages: the first doesn't complete the set (loop continues), the second
    // is empty (loop breaks) — covering both pagination exit branches.
    played: [Psn.playedPage(playedTitles, 20), Psn.playedPage([], 20)],
    // Two non-empty pages: the first has a known total (loop continues), the
    // second an unknown total (breaks via page fullness).
    titles: [
      Psn.trophyPage(trophyTitles.slice(0, 2), 100),
      withoutTotal(Psn.trophyPage(trophyTitles.slice(2), 0)),
    ],
  }).handlers;
}

beforeEach(() => delete process.env.RAWG_API_KEY);

describe(".signInEffect", () => {
  it("normalizes a live PSN account for a valid token", async () => {
    server.use(...liveHandlers());

    const result = await runSignIn("npsso-token");

    expect(result.isDemo).toBe(false);
    expect(result.profile.onlineId).toBe("Ernxst_");
    expect(result.profile.avatarUrl).toBe("https://img/xl");
    expect(result.profile.isPlus).toBe(true);
    expect(result.profile.aboutMe).toBe("Hello there");
    expect(result.profile.totalTrophies).toBe(9 + 54 + 188 + 887);

    // Apps are excluded; games are sorted by hours desc.
    expect(result.games.map((g) => g.titleId)).toStrictEqual([
      "cod",
      "d2",
      "shorty",
      "unknown",
      "weird",
    ]);
    expect(result.meta.appsExcluded).toStrictEqual([
      { name: "Netflix", hours: 3 },
      { name: "Spotify", hours: 1.5 },
    ]);
    // Minutes/seconds-only duration rounds to two decimals.
    expect(result.games[2]!.hours).toBe(0.76);

    const cod = result.games[0]!;

    expect(cod.hours).toBe(100.5);
    expect(cod.platform).toBe("PS4");
    expect(cod.imageUrl).toBe("https://img/cod");
    expect(cod.firstPlayed).toBe("2020-01-01");
    expect(cod.trophy).toStrictEqual({
      progress: 90,
      earned: { platinum: 1, gold: 5, silver: 10, bronze: 20 },
      total: 36,
      hasPlatinum: true,
      lastEarnedAt: "2021-06-10T00:00:00Z",
    });

    // Matched trophy with zero earned → no lastEarnedAt, no platinum.
    expect(result.games[1]!.trophy).toMatchObject({
      total: 0,
      hasPlatinum: false,
      lastEarnedAt: undefined,
    });

    // RAWG is the sole enrichment source and runs client-side, so every game
    // leaves the snapshot with the baseline "Other" genre and no franchise —
    // even a well-known title like Call of Duty is no longer keyword-classified.
    expect(result.games.every((g) => g.genre === "Other" && g.franchise === undefined)).toBe(true);

    // Unmatched + unknown-name title has the baseline "Other" genre, no trophy.
    const unknown = result.games.find((g) => g.titleId === "unknown")!;

    expect(unknown.genre).toBe("Other");
    expect(unknown.trophy).toBeUndefined();
    expect(unknown.imageUrl).toBeUndefined();
    expect(unknown.hours).toBe(0);
    // Missing playCount is normalized to 0.
    expect(unknown.playCount).toBe(0);
    expect(unknown.firstPlayed).toBeUndefined();
    expect(unknown.lastPlayed).toBeUndefined();
  });

  it("matches a played title to its trophy list by canonical concept name", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "gow",
                // Store name carries an edition suffix the trophy set lacks, so it
                // only resolves via the canonical concept name.
                name: "God of War Ragnarök: Digital Deluxe Edition",
                category: "ps5_native_game",
                concept: { ...basePlayed.concept, name: "God of War Ragnarök" },
                playDuration: "PT220H",
                playCount: 7,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [
              Psn.trophyTitle({
                trophyTitleName: "God of War Ragnarök",
                progress: 73,
                definedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 1 },
                earnedTrophies: { bronze: 20, silver: 5, gold: 2, platinum: 1 },
                lastUpdatedDateTime: "2023-02-01T00:00:00Z",
              }),
            ],
            1
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const gow = result.games.find((g) => g.titleId === "gow")!;

    expect(gow.trophy).toStrictEqual({
      progress: 73,
      earned: { platinum: 1, gold: 2, silver: 5, bronze: 20 },
      total: 28,
      hasPlatinum: true,
      lastEarnedAt: "2023-02-01T00:00:00Z",
    });
  });

  it("matches a glyph-glued trophy name carrying a brand prefix to its played title", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "div2",
                name: "The Division 2",
                category: "ps4_game",
                concept: { ...basePlayed.concept, name: "The Division 2" },
                playDuration: "PT460H",
                playCount: 12,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [
              Psn.trophyTitle({
                // Glyph glues "Division" to "2" and a "Tom Clancy's" brand prefix
                // sits only on the trophy side, so only a subset match resolves it.
                trophyTitleName: "Tom Clancy's The Division®2",
                progress: 64,
                earnedTrophies: { bronze: 30, silver: 8, gold: 3, platinum: 0 },
                lastUpdatedDateTime: "2024-01-01T00:00:00Z",
              }),
            ],
            1
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toStrictEqual({
      progress: 64,
      earned: { platinum: 0, gold: 3, silver: 8, bronze: 30 },
      total: 41,
      hasPlatinum: false,
      lastEarnedAt: "2024-01-01T00:00:00Z",
    });
  });

  it("does not subset-match an unrelated trophy list to a played title", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "div2",
                name: "The Division 2",
                category: "ps4_game",
                concept: { ...basePlayed.concept, name: "The Division 2" },
                playDuration: "PT460H",
                playCount: 12,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [Psn.trophyTitle({ trophyTitleName: "Forza Horizon 5", progress: 50 })],
            1
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toBeUndefined();
  });

  it.each([
    { playedName: "God of War", trophyTitleName: "God of War Ragnarök" },
    { playedName: "Persona 5", trophyTitleName: "Persona 5 Royal" },
    { playedName: "Grand Theft Auto V", trophyTitleName: "Grand Theft Auto V: The Story" },
    { playedName: "LEGO Star Wars", trophyTitleName: "LEGO Star Wars: The Skywalker Saga" },
    { playedName: "Call of Duty", trophyTitleName: "Call of Duty: Modern Warfare" },
  ])(
    'does not attach the more-specific "$trophyTitleName" to the broader played "$playedName"',
    async ({ playedName, trophyTitleName }) => {
      server.use(
        ...mockPsn({
          played: [
            Psn.playedPage(
              [
                Psn.playedTitle({
                  titleId: "seq",
                  name: playedName,
                  category: "ps5_native_game",
                  concept: { ...basePlayed.concept, name: playedName },
                  playDuration: "PT40H",
                  playCount: 5,
                }),
              ],
              1
            ),
          ],
          titles: [Psn.trophyPage([Psn.trophyTitle({ trophyTitleName, progress: 60 })], 1)],
        }).handlers
      );

      const result = await runSignIn("npsso-token");

      const game = result.games.find((g) => g.titleId === "seq")!;

      expect(game.trophy).toBeUndefined();
    }
  );

  it("matches a played title that carries a trailing platform suffix the trophy list omits", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "gta5",
                name: "Grand Theft Auto V (PlayStation®5)",
                category: "ps5_native_game",
                concept: { ...basePlayed.concept, name: "Grand Theft Auto V (PlayStation®5)" },
                playDuration: "PT300H",
                playCount: 20,
              }),
            ],
            1
          ),
        ],
        // Two stacks under one name: the more-progressed PS5 set is the representative.
        titles: [
          Psn.trophyPage(
            [
              Psn.trophyTitle({ trophyTitleName: "Grand Theft Auto V", progress: 27 }),
              Psn.trophyTitle({
                trophyTitleName: "Grand Theft Auto V",
                progress: 28,
                earnedTrophies: { bronze: 40, silver: 8, gold: 2, platinum: 0 },
                lastUpdatedDateTime: "2024-03-01T00:00:00Z",
              }),
            ],
            2
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const gta5 = result.games.find((g) => g.titleId === "gta5")!;

    expect(gta5.trophy).toStrictEqual({
      progress: 28,
      earned: { platinum: 0, gold: 2, silver: 8, bronze: 40 },
      total: 50,
      hasPlatinum: false,
      lastEarnedAt: "2024-03-01T00:00:00Z",
    });
  });

  it("matches the glyph-glued The Division 2 when the brand prefix is on both sides", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "div2",
                name: "Tom Clancy's The Division 2",
                category: "ps4_game",
                concept: { ...basePlayed.concept, name: "Tom Clancy's The Division 2" },
                playDuration: "PT70H",
                playCount: 8,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [Psn.trophyTitle({ trophyTitleName: "Tom Clancy's The Division® 2", progress: 70 })],
            1
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const div2 = result.games.find((g) => g.titleId === "div2")!;

    expect(div2.trophy).toMatchObject({ progress: 70 });
  });

  it("keeps the most-progressed trophy list when a game has several under one name", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "minecraft",
                name: "Minecraft",
                category: "ps5_native_game",
                concept: { ...basePlayed.concept, name: "Minecraft" },
                playDuration: "PT120H",
                playCount: 15,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [
              Psn.trophyTitle({ trophyTitleName: "Minecraft", progress: 22 }),
              Psn.trophyTitle({ trophyTitleName: "Minecraft", progress: 34 }),
              // An additional set normalizes to a distinct key and must not clobber.
              Psn.trophyTitle({ trophyTitleName: "Minecraft • Set 2", progress: 2 }),
            ],
            3
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const minecraft = result.games.find((g) => g.titleId === "minecraft")!;

    expect(minecraft.trophy).toMatchObject({ progress: 34 });
  });

  it("leaves trophy undefined when no candidate name matches a trophy list", async () => {
    server.use(
      ...mockPsn({
        played: [
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "obscure",
                name: "Some Game With No Trophies",
                category: "ps5_native_game",
                concept: { ...basePlayed.concept, name: "Some Game With No Trophies" },
                playDuration: "PT5H",
                playCount: 1,
              }),
            ],
            1
          ),
        ],
        titles: [
          Psn.trophyPage(
            [Psn.trophyTitle({ trophyTitleName: "An Unrelated Game", progress: 50 })],
            1
          ),
        ],
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    const obscure = result.games.find((g) => g.titleId === "obscure")!;

    expect(obscure.trophy).toBeUndefined();
  });

  it("falls back to an empty trophy map when the trophy fetch fails", async () => {
    server.use(
      ...mockPsn({
        profile: Psn.profile({ avatarUrls: [], aboutMe: "" }),
        // Single page with no total: exercises the played-games page-fullness fallback.
        played: [withoutTotal(Psn.playedPage(playedTitles, 0))],
        trophiesUnavailable: true,
      }).handlers
    );

    const result = await runSignIn("npsso-token");

    expect(result.isDemo).toBe(false);
    expect(result.profile.avatarUrl).toBeUndefined();
    expect(result.profile.aboutMe).toBeUndefined();
    expect(result.games.every((g) => g.trophy === undefined)).toBe(true);
  });

  it("falls back to the first listed avatar when no xl/l/m size is present", async () => {
    server.use(
      ...liveHandlers(
        Psn.profile({ avatarUrls: [{ size: "s", avatarUrl: "https://img/s" }], plus: 0 })
      )
    );

    const result = await runSignIn("fresh-token");

    expect(result.isDemo).toBe(false);
    expect(result.profile.avatarUrl).toBe("https://img/s");
    expect(result.profile.isPlus).toBe(false);
  });

  it("rejects with a credential-rejected error when the npsso exchange fails", async () => {
    server.use(...mockPsn({ authorize: "reject" }).handlers);

    const promise = runSignIn("bad-token");

    await expect(promise).rejects.toMatchObject({
      name: "SignInError",
      kind: "credential_rejected",
      message: "That token didn't work — it may be expired. Grab a fresh npsso and try again.",
    });
    // The raw transport cause must never leak into the client message.
    await expect(promise).rejects.not.toThrow(/nope/);
  });

  it("rejects with a rate-limited error when PlayStation throttles the fetch", async () => {
    server.use(...mockPsn({ profileError: "429 Too Many Requests" }).handlers);

    const promise = runSignIn("npsso-token");

    await expect(promise).rejects.toMatchObject({
      name: "SignInError",
      kind: "rate_limited",
      message: "PlayStation is rate-limiting requests. Wait a moment and try again.",
    });
    await expect(promise).rejects.not.toThrow(/429|too many requests/i);
  });

  it("rejects with an unavailable error when PlayStation is down", async () => {
    server.use(...mockPsn({ profileError: "upstream exploded" }).handlers);

    const promise = runSignIn("npsso-token");

    await expect(promise).rejects.toMatchObject({
      name: "SignInError",
      kind: "upstream_unavailable",
      message: "PlayStation is unavailable right now. Try again later.",
    });
    await expect(promise).rejects.not.toThrow(/exploded/);
  });

  it("rejects with an internal error when the snapshot fails the DashboardData contract", async () => {
    // A non-finite trophy level normalizes through but fails the `DashboardData`
    // decode (`SchemaError`) — our contract breaking, not the user's token.
    server.use(
      ...liveHandlers(
        Psn.profile({
          trophySummary: {
            level: Number.NaN,
            progress: 70,
            earnedTrophies: { bronze: 1, silver: 1, gold: 1, platinum: 1 },
          },
        })
      )
    );

    const promise = runSignIn("npsso-token");

    await expect(promise).rejects.toMatchObject({
      name: "SignInError",
      kind: "internal",
      message: "Something went wrong on our end. Please try again.",
    });
    // No schema/field detail leaks into the client message.
    await expect(promise).rejects.not.toThrow(/trophyLevel|Finite|NaN|SchemaError/);
  });

  it("sanitises an unexpected normalization defect at the live HTTP boundary", async () => {
    server.use(...liveHandlers());
    server.use(
      http.get(psnProfileUrl("users/me/profile2"), () =>
        HttpResponse.json({
          ...Psn.profile(),
          profile: { ...Psn.profile().profile, aboutMe: null },
        })
      )
    );

    // The malformed upstream value reaches toProfileSummary and defects on
    // `aboutMe.length`. This is Effect.catchDefect coverage, distinct from the
    // DashboardData SchemaError case above.
    const promise = runSignIn("npsso-token");

    await expect(promise).rejects.toMatchObject({
      name: "SignInError",
      kind: "internal",
      message: "Something went wrong on our end. Please try again.",
    });
    await expect(promise).rejects.not.toThrow(/aboutMe|length|null|TypeError/);
  });

  it("keeps paging played games past a full first page when PSN omits the total", async () => {
    // A full first page (== the 200 limit) with no total: the loop must keep
    // going and fetch the (short) second page rather than stop after page one.
    const firstPage = Array.from({ length: 200 }, (_, i) =>
      Psn.playedTitle({
        titleId: `bulk-${i}`,
        name: `Bulk Game ${i}`,
        category: "ps5_native_game",
        playDuration: "PT1H",
        playCount: 1,
      })
    );
    const { handlers, getPlayedGames } = mockPsn({
      played: [
        withoutTotal(Psn.playedPage(firstPage, 0)),
        withoutTotal(
          Psn.playedPage(
            [
              Psn.playedTitle({
                titleId: "second-page",
                name: "Second Page Game",
                category: "ps5_native_game",
                playDuration: "PT2H",
                playCount: 1,
              }),
            ],
            0
          )
        ),
      ],
      titles: [Psn.trophyPage([], 0)],
    });
    server.use(...handlers);

    const result = await runSignIn("npsso-token");

    expect(getPlayedGames).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(201);
    expect(result.games.map((g) => g.titleId)).toContain("second-page");
  });

  it("keeps paging trophy titles past a full first page when PSN omits the total", async () => {
    // A full first trophy page (== the 800 limit) with no total; the matching
    // trophy list lives on the (short) second page, only reached if paging
    // continues past the full page.
    const firstTrophyPage = Array.from({ length: 800 }, (_, i) =>
      Psn.trophyTitle({ trophyTitleName: `Filler Trophy ${i}`, progress: 1 })
    );
    const { handlers, getUserTitles } = mockPsn({
      played: [
        Psn.playedPage(
          [
            Psn.playedTitle({
              titleId: "marker",
              name: "Marker Trophy Game",
              category: "ps5_native_game",
              concept: { ...basePlayed.concept, name: "Marker Trophy Game" },
              playDuration: "PT9H",
              playCount: 4,
            }),
          ],
          1
        ),
      ],
      titles: [
        withoutTotal(Psn.trophyPage(firstTrophyPage, 0)),
        withoutTotal(
          Psn.trophyPage(
            [Psn.trophyTitle({ trophyTitleName: "Marker Trophy Game", progress: 55 })],
            0
          )
        ),
      ],
    });
    server.use(...handlers);

    const result = await runSignIn("npsso-token");

    const marker = result.games.find((g) => g.titleId === "marker")!;

    expect(getUserTitles).toHaveBeenCalledTimes(2);
    expect(marker.trophy).toMatchObject({ progress: 55 });
  });
});
