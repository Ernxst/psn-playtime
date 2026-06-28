/**
 * Server data layer. Fetches a single PlayStation account's play-time from PSN
 * via psn-api and normalizes everything into the `DashboardData` contract.
 *
 * The npsso token is used transiently to fetch an account once; it is never
 * stored server-side. The derived `DashboardData` is cached client-side
 * (`@/lib/dashboard-store`), which is the source for revisits.
 */
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type { AuthorizationPayload } from "psn-api";
import { z } from "zod";
import { runServer } from "@/integrations/effect/runtime.effect";
import { enrichTitle, platformOf } from "@/lib/psn/enrich";
import type {
  DashboardData,
  DashboardMeta,
  GamePlay,
  GameTrophy,
  Genre,
  ProfileSummary,
  TrophyCounts,
} from "@/lib/psn/types";
import { round } from "@/lib/psn/util";
import {
  EnrichmentProviderLayer,
  prefetchFranchises,
  prefetchGameMetadata,
} from "@/server/rawg.effect";

/** Exchange an npsso token for an access-token authorization payload. */
async function authenticate(npsso: string): Promise<AuthorizationPayload> {
  const accessCode = await exchangeNpssoForAccessCode(npsso);
  const tokens = await exchangeAccessCodeForAuthTokens(accessCode);
  return { accessToken: tokens.accessToken };
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

const PLAYED_PAGE_LIMIT = 200;
const TROPHY_PAGE_LIMIT = 800;

/**
 * Whether paging should stop. PSN normally reports `totalItemCount`, but it can
 * omit it; the old `?? all.length` fallback made the stop condition trivially
 * true after a full first page, silently dropping every later page. So when the
 * count is absent fall back to page fullness: keep going while the last page was
 * full (more may follow) and stop only on a short or empty page.
 */
function pagingComplete(
  pageSize: number,
  fetched: number,
  totalItemCount: number | undefined,
  limit: number
): boolean {
  if (pageSize === 0) return true;
  if (totalItemCount !== undefined) return fetched >= totalItemCount;
  return pageSize < limit;
}

type PlayedTitle = Awaited<ReturnType<typeof getUserPlayedGames>>["titles"][number];

async function fetchAllPlayedGames(auth: AuthorizationPayload): Promise<PlayedTitle[]> {
  const all: PlayedTitle[] = [];
  let offset = 0;
  for (;;) {
    const res = await getUserPlayedGames(auth, "me", { limit: PLAYED_PAGE_LIMIT, offset });
    all.push(...res.titles);
    offset += res.titles.length;
    if (pagingComplete(res.titles.length, all.length, res.totalItemCount, PLAYED_PAGE_LIMIT)) break;
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
    const res = await getUserTitles(auth, "me", { limit: TROPHY_PAGE_LIMIT, offset });
    all.push(...res.trophyTitles);
    offset += res.trophyTitles.length;
    totalItemCount = res.totalItemCount;
    if (pagingComplete(res.trophyTitles.length, all.length, res.totalItemCount, TROPHY_PAGE_LIMIT))
      break;
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
    const hours = round(hoursFromDuration(title.playDuration), 2);
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
    totalHours: round(
      games.reduce((sum, g) => sum + g.hours, 0),
      2
    ),
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

const signInInput = z.object({
  npsso: z.string().trim().min(1, "Paste your npsso token first."),
});

/**
 * Fetch and normalize one account from a transient npsso token. The token is
 * never stored server-side; the caller persists the returned `DashboardData` in
 * the client cache. Throws a friendly error when the token is rejected.
 */
export async function signInWithTokenHandler(
  data: z.infer<typeof signInInput>
): Promise<DashboardData> {
  try {
    const auth = await authenticate(data.npsso);
    return await buildDashboard(auth);
  } catch {
    throw new Error(
      "That token didn't work — it may be expired. Grab a fresh npsso and try again."
    );
  }
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

/**
 * The unique title names a RAWG lookup should run for: keyword rules are the
 * fast path, so only titles they leave matching `needsLookup` (and that aren't
 * apps) fall through. Mirrors the previous prefetch filtering exactly.
 */
function rawgLookupNames(
  titles: Array<{ name: string; category?: string }>,
  needsLookup: (enriched: ReturnType<typeof enrichTitle>) => boolean
): string[] {
  const names = new Set<string>();
  for (const title of titles) {
    const enriched = enrichTitle(title.name, title.category);
    if (!enriched.isApp && needsLookup(enriched)) names.add(title.name);
  }
  return Array.from(names);
}

export const signInWithToken = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(({ data }) => signInWithTokenHandler(data));

export const getRawgGenres = createServerFn({ method: "POST" })
  .validator(rawgGenreInput)
  .handler(
    async ({
      data,
    }): Promise<Array<{ titleId: string; genre?: Genre; typicalPlaytime?: number }>> => {
      const names = rawgLookupNames(data.titles, (enriched) => enriched.genre === "Other");
      const metadata = await runServer(
        prefetchGameMetadata(names).pipe(Effect.provide(EnrichmentProviderLayer))
      );
      return data.titles.flatMap((title) => {
        const info = metadata.get(title.name);
        const genre = info?.genre;
        const typicalPlaytime = info?.typicalPlaytime;
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
    const names = rawgLookupNames(data.titles, (enriched) => enriched.franchise === undefined);
    const rawgFranchises = await runServer(
      prefetchFranchises(names).pipe(Effect.provide(EnrichmentProviderLayer))
    );
    return data.titles.flatMap((title) => {
      const franchise = rawgFranchises.get(title.name);
      return franchise ? [{ titleId: title.titleId, franchise }] : [];
    });
  });
