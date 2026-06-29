/**
 * Pure normalization for the PSN account provider.
 *
 * Everything here is a plain function over psn-api shapes — the played-games ⇄
 * trophy name-matching, profile/game normalization, paging-stop logic, and
 * snapshot meta. No Effect *workflows* (no `Effect`/`Layer`/`Stream`, no
 * services), and crucially no banned `Date` global, so the strict
 * `*.effect.ts` files can value-import it without the language-service rules
 * cascading a violation. `isoDate` uses the sanctioned pure `DateTime`
 * functions (not the `Date` global) precisely so it stays cascade-safe while
 * keeping the old UTC-normalizing behaviour byte-for-byte.
 *
 * Moved verbatim out of `psn.effect.ts` (PR #212); behaviour is unchanged.
 */
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type { ProfileFromUserNameResponse, TrophyTitle, UserPlayedGamesResponse } from "psn-api";
import { round } from "@/domain/round";
import type {
  DashboardMeta,
  GamePlay,
  GameTrophy,
  Platform,
  ProfileSummary,
  TrophyCounts,
} from "../snapshot";

export type PlayedTitle = UserPlayedGamesResponse["titles"][number];
export type { TrophyTitle };
type ProfileBody = ProfileFromUserNameResponse["profile"];

/** Streaming / music / browser apps that should be excluded from play stats. */
const APP_RULE =
  /youtube|netflix|spotify|disney\s?\+|disney plus|prime video|amazon prime|bbc iplayer|apple tv|apple music|\btwitch\b|\bplex\b|\bnow\b|channel\s?4|sky go|\bhulu\b|crunchyroll|\bhbo\b|^max$|\bdazn\b|\btidal\b|deezer|peacock|paramount\s?\+|funimation|web browser|internet browser/i;

/**
 * Whether a played title is a non-game app (streaming/music/browser) the
 * `AccountProvider` excludes from play stats. PSN-specific: the `media_app`
 * category check keys off psn-api's category vocabulary.
 */
function isApp(name: string, category?: string): boolean {
  if (category !== undefined && /media_app|_app\b/i.test(category)) return true;
  return APP_RULE.test(name);
}

/** Token → platform, tested against the category first, then the title name. */
const PLATFORM_TOKENS: Array<[RegExp, Platform]> = [
  [/ps5|playstation®5/i, "PS5"],
  [/ps4|playstation®4/i, "PS4"],
  [/ps3|playstation®3/i, "PS3"],
  [/vita/i, "PSVITA"],
];

function platformFromText(text: string): Platform | undefined {
  for (const [test, platform] of PLATFORM_TOKENS) {
    if (test.test(text)) return platform;
  }
  return undefined;
}

/**
 * Derive a console platform from the psn-api `category` (preferred) or title
 * name. PSN-specific: it parses PSN's category vocabulary, so it stays private
 * to this provider.
 */
function platformOf(category: string | undefined, name: string): Platform {
  return platformFromText(category ?? "") ?? platformFromText(name) ?? "OTHER";
}

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

/** Normalize a psn-api profile body into the `ProfileSummary` contract. */
export function toProfileSummary(profile: ProfileBody): ProfileSummary {
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

export function buildTrophyMap(titles: TrophyTitle[]): Map<string, TrophyTitle> {
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
    hasPlatinum: title.definedTrophies.platinum > 0,
    lastEarnedAt: total > 0 ? title.lastUpdatedDateTime : undefined,
  };
}

function toGamePlay(
  title: PlayedTitle,
  hours: number,
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
    // RAWG is the sole enrichment source and runs client-side after this
    // snapshot, so the baseline genre is "Other" and the franchise unset.
    genre: "Other",
    franchise: undefined,
    isApp: false,
    trophy: trophyFor(trophyMap, [title.name, title.concept?.name ?? ""]),
  };
}

export interface Partitioned {
  games: GamePlay[];
  appsExcluded: Array<{ name: string; hours: number }>;
}

/**
 * Split played titles into games and excluded apps, joining each game to its
 * trophy list. Genres are not classified here — RAWG is the sole enrichment
 * source, a separate deferred `EnrichmentProvider` concern merged client-side,
 * so every game leaves this port with the baseline "Other" genre and no
 * franchise; the snapshot is honestly un-enriched.
 */
export function partitionTitles(
  playedTitles: PlayedTitle[],
  trophyMap: Map<string, TrophyTitle>
): Partitioned {
  const games: GamePlay[] = [];
  const appsExcluded: Partitioned["appsExcluded"] = [];
  for (const title of playedTitles) {
    const hours = round(hoursFromDuration(title.playDuration), 2);
    if (isApp(title.name, title.category)) {
      appsExcluded.push({ name: title.name, hours });
      continue;
    }
    games.push(toGamePlay(title, hours, trophyMap));
  }
  games.sort((a, b) => b.hours - a.hours);
  appsExcluded.sort((a, b) => b.hours - a.hours);
  return { games, appsExcluded };
}

export function computeMeta(
  games: GamePlay[],
  appsExcluded: Partitioned["appsExcluded"]
): DashboardMeta {
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
