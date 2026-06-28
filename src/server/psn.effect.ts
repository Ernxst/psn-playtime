/**
 * PSN-backed implementation of the `AccountProvider` port (phase E5).
 *
 * This is the keystone server port: the whole of the old `psn.ts`'s `authenticate`
 * + `buildDashboard` — npsso exchange, paged profile/played-games/trophy fetches,
 * the played-games ⇄ trophy name-matching, and normalization into the
 * un-enriched `DashboardData` contract — moved behind the platform-agnostic seam
 * so a future Xbox provider satisfies the same shape.
 *
 * Behaviour mirrors the previous `psn.ts` exactly:
 * - `psn-api` is promise-based, so each call is wrapped with `Effect.tryPromise`.
 *   A failed npsso/access-code exchange becomes `CredentialRejectedError`; a
 *   profile/played/trophy fetch becomes `ProviderRateLimitedError` on a detected
 *   HTTP 429 or `ProviderUnavailableError` otherwise.
 * - The trophy fetch is swallowed to `[]` on any failure, exactly as the old
 *   `fetchTrophyTitles(auth).catch(() => [])`, so a trophy outage never fails the
 *   whole snapshot.
 * - `fetchedAt` is stamped from Effect's `DateTime.now` (`formatIso` is
 *   byte-identical to the old `new Date().toISOString()`); `isoDate` likewise uses
 *   `DateTime` instead of the banned `Date` global, with `formatIsoDateUtc`
 *   matching the old `.toISOString().slice(0, 10)`.
 *
 * The pure name-matching/normalization helpers live here (rather than importing
 * the old `psn.ts`, which carries banned globals) so this file and everything it
 * value-imports stay compliant with the strict `@effect/language-service` rules.
 * `round` is value-imported from `@/lib/psn/round` (a `Date`-free module);
 * `@/lib/psn/util` itself stays unimported because its `yearOf` uses the banned
 * `Date` global.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromUserName,
  getUserPlayedGames,
  getUserTitles,
} from "psn-api";
import type { AuthorizationPayload } from "psn-api";
import { enrichTitle, platformOf } from "@/lib/psn/enrich";
import { round } from "@/lib/psn/round";
import type {
  DashboardData,
  DashboardMeta,
  GamePlay,
  GameTrophy,
  ProfileSummary,
  TrophyCounts,
} from "@/lib/psn/types";
import {
  AccountProvider,
  type AccountCredential,
  type AccountProviderShape,
} from "@/server/ports/account-provider.effect";
import {
  CredentialRejectedError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
  type AccountProviderError,
} from "@/server/ports/errors.effect";

type PlayedTitle = Awaited<ReturnType<typeof getUserPlayedGames>>["titles"][number];
type TrophyTitle = Awaited<ReturnType<typeof getUserTitles>>["trophyTitles"][number];

// -----------------------------------------------------------------------------
// Pure helpers (strict-rule compliant; moved verbatim from the old psn.ts)
// -----------------------------------------------------------------------------

/** Convert an ISO-8601 duration like "PT123H4M5S" to decimal hours. */
function hoursFromDuration(iso: string | undefined): number {
  if (iso === undefined || iso.length === 0) return 0;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (match === null) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours + minutes / 60 + seconds / 3600;
}

/** Reduce an ISO timestamp to a `YYYY-MM-DD` date, or undefined if invalid. */
function isoDate(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return Option.match(DateTime.make(value), {
    onNone: () => undefined,
    onSome: (date) => DateTime.formatIsoDateUtc(date),
  });
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
    if (url !== undefined) return url;
  }
  return urls[0]?.avatarUrl;
}

type ProfileBody = Awaited<ReturnType<typeof getProfileFromUserName>>["profile"];

/** Normalize a psn-api profile body into the `ProfileSummary` contract. */
function toProfileSummary(profile: ProfileBody): ProfileSummary {
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
    aboutMe: profile.aboutMe.length > 0 ? profile.aboutMe : undefined,
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

function buildTrophyMap(titles: TrophyTitle[]): Map<string, TrophyTitle> {
  const map = new Map<string, TrophyTitle>();
  for (const title of titles) {
    const key = matchKey(title.trophyTitleName);
    const existing = map.get(key);
    // A game can have several trophy lists under one name (PS4 + PS5 stacks);
    // on collision keep the more-progressed set as the deterministic
    // representative. Additional sets like "Minecraft • Set 2" normalize to a
    // distinct key ("minecraft set 2"), so they neither collide nor clobber.
    if (existing === undefined || title.progress > existing.progress) map.set(key, title);
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
    if (title !== undefined) return title;
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
    if (match !== undefined) return match;
  }
  return undefined;
}

function trophyFor(map: Map<string, TrophyTitle>, names: string[]): GameTrophy | undefined {
  const title = findTrophyTitle(map, names);
  if (title === undefined) return undefined;
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
    imageUrl: title.imageUrl.length > 0 ? title.imageUrl : undefined,
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
 * Split played titles into games and excluded apps, joining each game to its
 * trophy list. Genres stay keyword-only here — RAWG enrichment is the separate,
 * deferred `EnrichmentProvider` concern merged client-side, so the snapshot this
 * port returns is honestly un-enriched.
 */
function partitionTitles(
  playedTitles: PlayedTitle[],
  trophyMap: Map<string, TrophyTitle>
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
    games.push(toGamePlay(title, hours, enriched, trophyMap));
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

// -----------------------------------------------------------------------------
// Effectful boundary (psn-api wrapped in Effect.tryPromise)
// -----------------------------------------------------------------------------

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * psn-api collapses every HTTP failure into a thrown `Error` (it never surfaces
 * the response status), so a 429 can only be detected from the message text.
 * Best-effort: treat an explicit 429 / rate-limit signal as rate-limiting and
 * everything else as a generic outage, matching the old catch-all behaviour.
 */
const isRateLimited = (message: string): boolean =>
  message.includes("429") || /too many requests|rate limit/i.test(message);

const providerError = (error: unknown): ProviderRateLimitedError | ProviderUnavailableError => {
  const message = messageOf(error);
  return isRateLimited(message)
    ? new ProviderRateLimitedError({ provider: "psn" })
    : new ProviderUnavailableError({ provider: "psn", reason: message });
};

/**
 * Exchange a transient npsso for an access-token authorization payload. The
 * credential is read out of `Redacted` only to hand to psn-api and is never
 * logged; a rejection maps to `CredentialRejectedError` with a fixed reason so
 * the secret can never leak into an error.
 */
const authenticate = (
  credential: AccountCredential
): Effect.Effect<AuthorizationPayload, CredentialRejectedError> =>
  Effect.gen(function* () {
    const npsso = Redacted.value(credential);
    const accessCode = yield* Effect.tryPromise({
      try: () => exchangeNpssoForAccessCode(npsso),
      catch: () => new CredentialRejectedError({ reason: "npsso exchange rejected" }),
    });
    const tokens = yield* Effect.tryPromise({
      try: () => exchangeAccessCodeForAuthTokens(accessCode),
      catch: () => new CredentialRejectedError({ reason: "access-code exchange rejected" }),
    });
    return { accessToken: tokens.accessToken };
  });

const fetchProfile = (
  auth: AuthorizationPayload
): Effect.Effect<ProfileSummary, AccountProviderError> =>
  Effect.gen(function* () {
    const { profile } = yield* Effect.tryPromise({
      try: () => getProfileFromUserName(auth, "me"),
      catch: providerError,
    });
    return toProfileSummary(profile);
  });

/**
 * Page through a paginated PSN endpoint with `Stream.paginate`: the state is the
 * running `offset`, each step fetches one page, and `pagingComplete` decides
 * (identically to the old loop, preserving the #140 fix) whether to continue
 * with `Option.some(nextOffset)` or stop with `Option.none()`. `Stream.runCollect`
 * flattens the pages into one array.
 */
const fetchAllPlayedGames = (
  auth: AuthorizationPayload
): Effect.Effect<PlayedTitle[], AccountProviderError> =>
  Stream.paginate(0, (offset: number) =>
    Effect.tryPromise({
      try: () => getUserPlayedGames(auth, "me", { limit: PLAYED_PAGE_LIMIT, offset }),
      catch: providerError,
    }).pipe(
      Effect.map((res) => {
        const next = offset + res.titles.length;
        const stop = pagingComplete(res.titles.length, next, res.totalItemCount, PLAYED_PAGE_LIMIT);
        return [res.titles, stop ? Option.none() : Option.some(next)] as const;
      })
    )
  ).pipe(Stream.runCollect);

const fetchTrophyTitles = (
  auth: AuthorizationPayload
): Effect.Effect<TrophyTitle[], AccountProviderError> =>
  Stream.paginate(0, (offset: number) =>
    Effect.tryPromise({
      try: () => getUserTitles(auth, "me", { limit: TROPHY_PAGE_LIMIT, offset }),
      catch: providerError,
    }).pipe(
      Effect.map((res) => {
        const next = offset + res.trophyTitles.length;
        const stop = pagingComplete(
          res.trophyTitles.length,
          next,
          res.totalItemCount,
          TROPHY_PAGE_LIMIT
        );
        return [res.trophyTitles, stop ? Option.none() : Option.some(next)] as const;
      })
    )
  ).pipe(Stream.runCollect);

/**
 * Fetch and normalize one account into the un-enriched `DashboardData`. Profile,
 * played games, and trophies are fetched in parallel (matching the old
 * `Promise.all`); a trophy failure is swallowed to `[]` so it never sinks the
 * snapshot. `fetchedAt` is stamped from `DateTime.now`.
 */
const buildSnapshot = (
  auth: AuthorizationPayload
): Effect.Effect<DashboardData, AccountProviderError> =>
  Effect.gen(function* () {
    const [profile, playedTitles, trophyTitles] = yield* Effect.all(
      [
        fetchProfile(auth),
        fetchAllPlayedGames(auth),
        fetchTrophyTitles(auth).pipe(Effect.orElseSucceed((): TrophyTitle[] => [])),
      ],
      { concurrency: "unbounded" }
    );

    const now = yield* DateTime.now;
    const { games, appsExcluded } = partitionTitles(playedTitles, buildTrophyMap(trophyTitles));

    return {
      profile,
      games,
      fetchedAt: DateTime.formatIso(now),
      meta: computeMeta(games, appsExcluded),
      isDemo: false,
    };
  });

const fetchSnapshot = (
  credential: AccountCredential
): Effect.Effect<DashboardData, AccountProviderError> =>
  Effect.gen(function* () {
    const auth = yield* authenticate(credential);
    return yield* buildSnapshot(auth);
  });

/**
 * The PSN `AccountProvider` layer. Self-contained (`fetchSnapshot` needs no
 * further context), so a handler provides only this one layer.
 */
export const PsnAccountProviderLayer: Layer.Layer<AccountProvider> = Layer.succeed(
  AccountProvider,
  { fetchSnapshot } satisfies AccountProviderShape
);
