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
import { cached, SEVEN_DAYS_MS } from "@/server/edge-cache";
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
  lookupRawgPlaytime,
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

/**
 * A stable, non-secret edge-cache key for the signed-in account. The npsso is
 * the credential and is 1:1 with the account within a stored session, so its
 * SHA-256 hash isolates one user's cached dashboard from another's WITHOUT ever
 * placing the secret (or a reversible form of it) in the cache key. Hashing the
 * credential also lets us serve a cache hit before any PSN API call — including
 * the token exchange — which keying by the profile `accountId` (only available
 * after a profile fetch) could not.
 */
async function accountCacheKey(npsso: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(npsso));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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

/**
 * Normalize a title name for cross-source matching. Trademark glyphs (™®©) are
 * non-alphanumeric, so the `[^a-z0-9]+` step turns them into a separator —
 * "The Division®2" → "the division 2" rather than gluing into "division2".
 */
function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A trailing platform/console descriptor (often a parenthetical the trophy set
 * omits) breaks cross-gen matching — played "Grand Theft Auto V (PlayStation®5)"
 * normalizes to "grand theft auto v playstation 5" but the trophy set is just
 * "grand theft auto v". Strip only these TRAILING markers, never mid-name ones,
 * so both sides meet in the middle without dropping meaningful words.
 */
const TRAILING_PLATFORM =
  / (?:ps4 and ps5|ps5 and ps4|ps4 ps5|ps5 ps4|playstation 4|playstation 5|ps4|ps5)$/;

/** Normalize plus strip a trailing platform descriptor, for matching keys. */
function matchKey(name: string): string {
  return normName(name).replace(TRAILING_PLATFORM, "").trim();
}

/**
 * Whether `needle`'s tokens are the trailing run of `haystack`'s — i.e. only a
 * LEADING prefix may differ. This allows a brand prefix on one side ("the
 * division 2" is the suffix of "tom clancy s the division 2") but rejects a
 * sequel/edition appended at the end ("god of war" is a prefix, not a suffix,
 * of "god of war ragnar k"), which would otherwise attach the wrong list.
 */
function isTokenSuffix(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return haystack.slice(haystack.length - needle.length).join(" ") === needle.join(" ");
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

/**
 * Diagnostic aid for #74. The trophy fetch already pages through the full list
 * (`getUserTitles` caps at 800 per call and the loop offsets until
 * `totalItemCount`), so a game stuck on "—" is either absent from
 * `getUserTitles` for this account or present under a name our matcher misses.
 * Telling those apart needs the real account, which can't run here — so when
 * `PSN_DEBUG_TROPHIES` is set this dumps each fetched trophy title (raw name,
 * the key it matches under, platform, progress) plus fetched-vs-expected
 * counts. Off by default; never runs in normal use.
 */
function logTrophyTitlesDebug(titles: TrophyTitle[], totalItemCount: number | undefined): void {
  if (!process.env.PSN_DEBUG_TROPHIES) return;
  console.log(`[psn] getUserTitles fetched ${titles.length} of ${totalItemCount ?? "unknown"}`);
  for (const t of titles) {
    const name = JSON.stringify(t.trophyTitleName);
    const key = JSON.stringify(matchKey(t.trophyTitleName));
    console.log(`[psn] ${name} key=${key} platform=${t.npServiceName} progress=${t.progress}`);
  }
}

async function fetchTrophyTitles(auth: AuthorizationPayload): Promise<TrophyTitle[]> {
  const all: TrophyTitle[] = [];
  let offset = 0;
  let totalItemCount: number | undefined;
  for (;;) {
    const res = await getUserTitles(auth, "me", { limit: 800, offset });
    all.push(...res.trophyTitles);
    offset += res.trophyTitles.length;
    totalItemCount = res.totalItemCount;
    if (res.trophyTitles.length === 0 || all.length >= (res.totalItemCount ?? all.length)) break;
  }
  logTrophyTitlesDebug(all, totalItemCount);
  return all;
}

function buildTrophyMap(titles: TrophyTitle[]): Map<string, TrophyTitle> {
  const map = new Map<string, TrophyTitle>();
  for (const title of titles) {
    const key = matchKey(title.trophyTitleName);
    const existing = map.get(key);
    // A game can have several trophy lists under one name (PS4 + PS5 stacks);
    // on collision keep the more-progressed set as the deterministic
    // representative. Additional sets like "Minecraft • Set 2" normalize to a
    // distinct key ("minecraft set 2"), so they neither collide nor clobber.
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
    const title = map.get(matchKey(name));
    if (title) return title;
  }
  return findTrophyBySubset(map, names);
}

/**
 * A brand prefix (e.g. "Tom Clancy's") can sit on only one side of the
 * play/trophy name split, so exact equality misses even after normalization:
 * the trophy "Tom Clancy's The Division®2" → "tom clancy s the division 2"
 * never equals a played "the division 2". Fall back to a guarded token-subset
 * match — the shorter name's tokens must be the TRAILING run of the longer's
 * (only a leading prefix may differ), with enough tokens to be specific
 * (`MIN_SUBSET_TOKENS`) and a single unambiguous trophy list, so a sequel,
 * edition, or unrelated set is never attached.
 */
const MIN_SUBSET_TOKENS = 2;

function subsetMatch(playedKey: string, trophyKey: string): boolean {
  const a = playedKey.split(" ");
  const b = trophyKey.split(" ");
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < MIN_SUBSET_TOKENS) return false;
  return isTokenSuffix(shorter, longer);
}

function uniqueSubsetMatch(map: Map<string, TrophyTitle>, key: string): TrophyTitle | undefined {
  const matches = new Set<TrophyTitle>();
  for (const [trophyKey, title] of map) {
    if (subsetMatch(key, trophyKey)) matches.add(title);
  }
  return matches.size === 1 ? matches.values().next().value : undefined;
}

function findTrophyBySubset(
  map: Map<string, TrophyTitle>,
  names: string[]
): TrophyTitle | undefined {
  for (const name of names) {
    const match = uniqueSubsetMatch(map, matchKey(name));
    if (match) return match;
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

/** Typical hours-to-complete by title name; rides the same genre lookups. */
type RawgPlaytimeMap = Map<string, number | undefined>;

interface RawgGenreInfo {
  genres: RawgGenreMap;
  playtimes: RawgPlaytimeMap;
}

async function prefetchRawgGenres(
  playedTitles: Array<{ name: string; category?: string }>,
  rawgCache: RawgCache
): Promise<RawgGenreInfo> {
  const names = new Set<string>();
  const genres: RawgGenreMap = new Map();
  const playtimes: RawgPlaytimeMap = new Map();

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
        // Genre then playtime share one cached request, so this is a single call.
        genres.set(name, await lookupRawgGenre(name, rawgCache));
        playtimes.set(name, await lookupRawgPlaytime(name, rawgCache));
      })
    );
  }

  return { genres, playtimes };
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
  // Demo (signed-out) data is never cached — it is a static local payload.
  if (!npsso) return demoDashboard;
  try {
    const key = await accountCacheKey(npsso);
    // Edge-cached per account (~7-day TTL): a hit skips the npsso→token
    // exchange and every PSN fetch. Outside the worker the producer just runs.
    return await cached(`dashboard/${key}`, SEVEN_DAYS_MS, async () => {
      const auth = await authenticate(npsso);
      return buildDashboard(auth);
    });
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
  .handler(
    async ({
      data,
    }): Promise<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> => {
      const { genres, playtimes } = await prefetchRawgGenres(data.titles, createRawgCache());
      return data.titles.flatMap((title) => {
        const genre = genres.get(title.name);
        const typicalPlaytime = playtimes.get(title.name);
        if (!genre && typicalPlaytime === undefined) return [];
        return [
          {
            titleId: title.titleId,
            ...(genre && { genre }),
            ...(typicalPlaytime !== undefined && { typicalPlaytime }),
          },
        ];
      });
    }
  );

export const getRawgFranchises = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(async ({ data }): Promise<Array<{ titleId: string; franchise: string }>> => {
    const rawgFranchises = await prefetchRawgFranchises(data.titles, createRawgFranchiseCache());
    return data.titles.flatMap((title) => {
      const franchise = rawgFranchises.get(title.name);
      return franchise ? [{ titleId: title.titleId, franchise }] : [];
    });
  });
