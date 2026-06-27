/**
 * Server data layer. Fetches a single PlayStation account's play-time from PSN
 * via psn-api and normalizes everything into the `DashboardData` contract.
 *
 * The npsso session token is stored in an httpOnly cookie. When no token is
 * present (or auth fails) the bundled demo dataset is returned instead.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type { AuthorizationPayload } from "psn-api";
import { z } from "zod";
import { enrichTitle, platformOf } from "@/lib/psn/enrich";
import { demoDashboard } from "@/lib/psn/mock";
import type {
  DashboardData,
  DashboardMeta,
  GamePlay,
  GameTrophy,
  Genre,
  ProfileSummary,
  TrophyCounts,
} from "@/lib/psn/types";
import {
  createRawgCache,
  createRawgFranchiseCache,
  lookupRawgFranchise,
  lookupRawgGenre,
  type RawgCache,
  type RawgFranchiseCache,
} from "@/server/rawg";

const COOKIE_NAME = "psn_npsso";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 50; // ~50 days
const RAWG_LOOKUP_CONCURRENCY = 8;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/** Exchange an npsso token for an access-token authorization payload. */
async function authenticate(npsso: string): Promise<AuthorizationPayload> {
  const accessCode = await exchangeNpssoForAccessCode(npsso);
  const tokens = await exchangeAccessCodeForAuthTokens(accessCode);
  return { accessToken: tokens.accessToken };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert an ISO-8601 duration like "PT123H4M5S" to decimal hours. */
function hoursFromDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours + minutes / 60 + seconds / 3600;
}

/** Reduce an ISO timestamp to a `YYYY-MM-DD` date, or undefined if invalid. */
function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Normalize a title name for cross-source matching. */
function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickAvatar(urls: Array<{ size: string; avatarUrl: string }>): string | undefined {
  if (urls.length === 0) return undefined;
  const bySize = new Map(urls.map((u) => [u.size, u.avatarUrl]));
  for (const size of ["xl", "l", "m"]) {
    const url = bySize.get(size);
    if (url) return url;
  }
  return urls[0]?.avatarUrl;
}

async function fetchProfile(auth: AuthorizationPayload): Promise<ProfileSummary> {
  const { profile } = await getProfileFromUserName(auth, "me");
  const t = profile.trophySummary;
  const earned: TrophyCounts = {
    platinum: t.earnedTrophies.platinum,
    gold: t.earnedTrophies.gold,
    silver: t.earnedTrophies.silver,
    bronze: t.earnedTrophies.bronze,
  };
  return {
    onlineId: profile.onlineId,
    accountId: profile.accountId,
    aboutMe: profile.aboutMe || undefined,
    avatarUrl: pickAvatar(profile.avatarUrls),
    isPlus: profile.plus === 1,
    trophyLevel: t.level,
    levelProgress: t.progress,
    earned,
    totalTrophies: earned.platinum + earned.gold + earned.silver + earned.bronze,
  };
}

type PlayedTitle = Awaited<ReturnType<typeof getUserPlayedGames>>["titles"][number];

async function fetchAllPlayedGames(auth: AuthorizationPayload): Promise<PlayedTitle[]> {
  const all: PlayedTitle[] = [];
  let offset = 0;
  for (;;) {
    const res = await getUserPlayedGames(auth, "me", { limit: 200, offset });
    all.push(...res.titles);
    offset += res.titles.length;
    if (res.titles.length === 0 || all.length >= (res.totalItemCount ?? all.length)) break;
  }
  return all;
}

type TrophyTitle = Awaited<ReturnType<typeof getUserTitles>>["trophyTitles"][number];

async function fetchTrophyTitles(auth: AuthorizationPayload): Promise<TrophyTitle[]> {
  const all: TrophyTitle[] = [];
  let offset = 0;
  for (;;) {
    const res = await getUserTitles(auth, "me", { limit: 800, offset });
    all.push(...res.trophyTitles);
    offset += res.trophyTitles.length;
    if (res.trophyTitles.length === 0 || all.length >= (res.totalItemCount ?? all.length)) break;
  }
  return all;
}

function buildTrophyMap(titles: TrophyTitle[]): Map<string, TrophyTitle> {
  const map = new Map<string, TrophyTitle>();
  for (const title of titles) {
    const key = normName(title.trophyTitleName);
    const existing = map.get(key);
    // On name collisions (same game across platforms), keep the more-progressed set.
    if (!existing || title.progress > existing.progress) map.set(key, title);
  }
  return map;
}

/**
 * Find a played title's trophy list. The played-games and trophy endpoints
 * format names independently (store name vs trophy-set name), so a title is
 * tried under several candidate names — its store `name` first, then its
 * canonical `concept.name` (the same across PS4/PS5/editions), which often
 * matches the trophy-set name when an edition/platform suffix breaks the store
 * name. Returns undefined only when no candidate matches a real trophy list.
 */
function findTrophyTitle(map: Map<string, TrophyTitle>, names: string[]): TrophyTitle | undefined {
  for (const name of names) {
    const title = map.get(normName(name));
    if (title) return title;
  }
  return undefined;
}

function trophyFor(map: Map<string, TrophyTitle>, names: string[]): GameTrophy | undefined {
  const title = findTrophyTitle(map, names);
  if (!title) return undefined;
  const earned: TrophyCounts = {
    platinum: title.earnedTrophies.platinum,
    gold: title.earnedTrophies.gold,
    silver: title.earnedTrophies.silver,
    bronze: title.earnedTrophies.bronze,
  };
  const total = earned.platinum + earned.gold + earned.silver + earned.bronze;
  return {
    progress: title.progress,
    earned,
    total,
    hasPlatinum: earned.platinum > 0,
    lastEarnedAt: total > 0 ? title.lastUpdatedDateTime : undefined,
  };
}

function toGamePlay(
  title: PlayedTitle,
  hours: number,
  enriched: ReturnType<typeof enrichTitle>,
  trophyMap: Map<string, TrophyTitle>
): GamePlay {
  return {
    titleId: title.titleId,
    name: title.name,
    imageUrl: title.imageUrl || undefined,
    platform: platformOf(title.category, title.name),
    hours,
    playCount: title.playCount ?? 0,
    firstPlayed: isoDate(title.firstPlayedDateTime),
    lastPlayed: isoDate(title.lastPlayedDateTime),
    category: title.category,
    genre: enriched.genre,
    franchise: enriched.franchise,
    isApp: false,
    trophy: trophyFor(trophyMap, [title.name, title.concept?.name ?? ""]),
  };
}

interface Partitioned {
  games: GamePlay[];
  appsExcluded: Array<{ name: string; hours: number }>;
}

/**
 * Hybrid genre: keyword rules are the fast path. Only titles they leave as
 * "Other" (which also means no franchise) fall through to a RAWG lookup, which
 * keeps API calls minimal. A missing key, no match, or an error all keep the
 * keyword result.
 */
type RawgGenreMap = Map<string, Genre | undefined>;

function resolveGenre(
  name: string,
  enriched: ReturnType<typeof enrichTitle>,
  rawgGenres: RawgGenreMap
): Genre {
  if (enriched.genre !== "Other") return enriched.genre;
  const rawgGenre = rawgGenres.get(name);
  return rawgGenre ?? enriched.genre;
}

function partitionTitles(
  playedTitles: PlayedTitle[],
  trophyMap: Map<string, TrophyTitle>,
  rawgGenres: RawgGenreMap
): Partitioned {
  const games: GamePlay[] = [];
  const appsExcluded: Partitioned["appsExcluded"] = [];
  for (const title of playedTitles) {
    const hours = round2(hoursFromDuration(title.playDuration));
    const enriched = enrichTitle(title.name, title.category);
    if (enriched.isApp) {
      appsExcluded.push({ name: title.name, hours });
      continue;
    }
    const genre = resolveGenre(title.name, enriched, rawgGenres);
    games.push(toGamePlay(title, hours, { ...enriched, genre }, trophyMap));
  }
  games.sort((a, b) => b.hours - a.hours);
  appsExcluded.sort((a, b) => b.hours - a.hours);
  return { games, appsExcluded };
}

async function prefetchRawgGenres(
  playedTitles: Array<{ name: string; category?: string }>,
  rawgCache: RawgCache
): Promise<RawgGenreMap> {
  const names = new Set<string>();
  const rawgGenres: RawgGenreMap = new Map();

  for (const title of playedTitles) {
    const enriched = enrichTitle(title.name, title.category);
    if (!enriched.isApp && enriched.genre === "Other") names.add(title.name);
  }

  const uniqueNames = Array.from(names);
  for (let i = 0; i < uniqueNames.length; i += RAWG_LOOKUP_CONCURRENCY) {
    const batch = uniqueNames.slice(i, i + RAWG_LOOKUP_CONCURRENCY);
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    await Promise.all(
      batch.map(async (name) => {
        rawgGenres.set(name, await lookupRawgGenre(name, rawgCache));
      })
    );
  }

  return rawgGenres;
}

/**
 * Franchise/series, keyed by title name. Keyword `FRANCHISE_RULES` are the
 * high-confidence fast path; only titles they leave without a franchise fall
 * through to a RAWG lookup, matching the genre prefetch's minimal-call shape.
 */
type RawgFranchiseMap = Map<string, string | undefined>;

async function prefetchRawgFranchises(
  playedTitles: Array<{ name: string; category?: string }>,
  rawgCache: RawgFranchiseCache
): Promise<RawgFranchiseMap> {
  const names = new Set<string>();
  const rawgFranchises: RawgFranchiseMap = new Map();

  for (const title of playedTitles) {
    const enriched = enrichTitle(title.name, title.category);
    if (!enriched.isApp && enriched.franchise === undefined) names.add(title.name);
  }

  const uniqueNames = Array.from(names);
  for (let i = 0; i < uniqueNames.length; i += RAWG_LOOKUP_CONCURRENCY) {
    const batch = uniqueNames.slice(i, i + RAWG_LOOKUP_CONCURRENCY);
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    await Promise.all(
      batch.map(async (name) => {
        rawgFranchises.set(name, await lookupRawgFranchise(name, rawgCache));
      })
    );
  }

  return rawgFranchises;
}

function computeMeta(games: GamePlay[], appsExcluded: Partitioned["appsExcluded"]): DashboardMeta {
  const firstDates = games
    .map((g) => g.firstPlayed)
    .filter((d): d is string => Boolean(d))
    .sort();
  const lastDates = games
    .map((g) => g.lastPlayed)
    .filter((d): d is string => Boolean(d))
    .sort();
  const firstEverPlayed = firstDates[0];
  return {
    totalGames: games.length,
    totalHours: round2(games.reduce((sum, g) => sum + g.hours, 0)),
    totalSessions: games.reduce((sum, g) => sum + g.playCount, 0),
    appsExcluded,
    firstEverPlayed,
    span: { from: firstEverPlayed, to: lastDates.at(-1) },
  };
}

async function buildDashboard(auth: AuthorizationPayload): Promise<DashboardData> {
  const [profile, playedTitles, trophyTitles] = await Promise.all([
    fetchProfile(auth),
    fetchAllPlayedGames(auth),
    fetchTrophyTitles(auth).catch(() => [] as TrophyTitle[]),
  ]);

  const { games, appsExcluded } = partitionTitles(
    playedTitles,
    buildTrophyMap(trophyTitles),
    new Map<string, Genre | undefined>()
  );

  return {
    profile,
    games,
    fetchedAt: new Date().toISOString(),
    meta: computeMeta(games, appsExcluded),
    isDemo: false,
  };
}

interface CookieJar {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: ReturnType<typeof cookieOptions>) => void;
  remove: (name: string, options: { path: string }) => void;
}

export async function getDashboardHandler(cookies: CookieJar): Promise<DashboardData> {
  const npsso = cookies.get(COOKIE_NAME);
  if (!npsso) return demoDashboard;
  try {
    const auth = await authenticate(npsso);
    return await buildDashboard(auth);
  } catch {
    cookies.remove(COOKIE_NAME, { path: "/" });
    return demoDashboard;
  }
}

export const getDashboard = createServerFn({ method: "GET" }).handler(() =>
  getDashboardHandler({ get: getCookie, set: setCookie, remove: deleteCookie })
);

const signInInput = z.object({
  npsso: z.string().trim().min(1, "Paste your npsso token first."),
});

export async function signInWithTokenHandler(
  data: z.infer<typeof signInInput>,
  cookies: CookieJar
): Promise<DashboardData> {
  let dashboard: DashboardData;
  try {
    const auth = await authenticate(data.npsso);
    dashboard = await buildDashboard(auth);
  } catch {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  }
  cookies.set(COOKIE_NAME, data.npsso, cookieOptions());
  return dashboard;
}

const rawgGenreInput = z.object({
  titles: z.array(
    z.object({
      titleId: z.string(),
      name: z.string(),
      category: z.string().optional(),
    })
  ),
});

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) =>
    signInWithTokenHandler(data, { get: getCookie, set: setCookie, remove: deleteCookie })
  );

export function signOutHandler(cookies: CookieJar): { ok: true } {
  cookies.remove(COOKIE_NAME, { path: "/" });
  return { ok: true };
}

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  signOutHandler({ get: getCookie, set: setCookie, remove: deleteCookie })
);

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(async ({ data }): Promise<Array<{ titleId: string; genre: Genre }>> => {
    const rawgGenres = await prefetchRawgGenres(data.titles, createRawgCache());
    return data.titles.flatMap((title) => {
      const genre = rawgGenres.get(title.name);
      return genre ? [{ titleId: title.titleId, genre }] : [];
    });
  });

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(async ({ data }): Promise<Array<{ titleId: string; franchise: string }>> => {
    const rawgFranchises = await prefetchRawgFranchises(data.titles, createRawgFranchiseCache());
    return data.titles.flatMap((title) => {
      const franchise = rawgFranchises.get(title.name);
      return franchise ? [{ titleId: title.titleId, franchise }] : [];
    });
  });
