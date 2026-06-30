/**
 * The contract between the data layer and the UI, modelled as `Schema`.
 *
 * The server (`src/server/providers/account/psn/provider.effect.ts`) fetches from PSN via psn-api and normalizes
 * everything into a single `DashboardData` object. The UI (`src/lib/psn/analytics.ts`
 * + components) only ever consumes `DashboardData` — it never touches psn-api.
 *
 * This module is the single source of truth for the contract shape. It is the
 * decode/encode seam: `DashboardData` crosses the server-fn boundary AND is
 * persisted in the client localStorage cache, so a `Schema` lets us validate it
 * at those seams (see `decodeDashboard` in `@/server/api/account.effect`).
 *
 * Kept PURE — Date-free and Effect-workflow-free — so it stays out of the
 * `*.effect.ts` strict glob and can be imported cheaply by both sides. Importing
 * `Schema` from `effect` is fine anywhere.
 *
 * The exported names are each both a `Schema` value and the decoded TS type
 * (derived via `Schema.Schema.Type`), so consumers that only need the type keep
 * importing the same identifier; the wire/cache seams import the value to decode.
 */
import * as Schema from "effect/Schema";

export const Platform = Schema.Literals(["PS5", "PS4", "PS3", "PSVITA", "OTHER"]);
export type Platform = Schema.Schema.Type<typeof Platform>;

/** A coarse genre bucket used for the "what kind of player are you" breakdowns. */
export const Genre = Schema.Literals([
  "Shooter",
  "Sports",
  "RPG",
  "Action-Adventure",
  "Survival/Craft",
  "Racing",
  "Fighting",
  "Indie/Casual",
  "Open World",
  "Other",
]);
export type Genre = Schema.Schema.Type<typeof Genre>;

export const TrophyCounts = Schema.Struct({
  platinum: Schema.Finite,
  gold: Schema.Finite,
  silver: Schema.Finite,
  bronze: Schema.Finite,
});
export type TrophyCounts = Schema.Schema.Type<typeof TrophyCounts>;

export const ProfileSummary = Schema.Struct({
  onlineId: Schema.String,
  accountId: Schema.String,
  aboutMe: Schema.optional(Schema.String),
  avatarUrl: Schema.optional(Schema.String),
  isPlus: Schema.Boolean,
  /** PSN trophy level (e.g. 220). */
  trophyLevel: Schema.Finite,
  /** Percent progress toward the next trophy level (0–100). */
  levelProgress: Schema.Finite,
  earned: TrophyCounts,
  /** Sum of all earned trophies. */
  totalTrophies: Schema.Finite,
});
export type ProfileSummary = Schema.Schema.Type<typeof ProfileSummary>;

/** Per-game trophy progress, when available. */
export const GameTrophy = Schema.Struct({
  /** 0–100 completion of the trophy list. */
  progress: Schema.Finite,
  earned: TrophyCounts,
  total: Schema.Finite,
  hasPlatinum: Schema.Boolean,
  /** ISO date of the most recently earned trophy in this game, if any. */
  lastEarnedAt: Schema.optional(Schema.String),
});
export type GameTrophy = Schema.Schema.Type<typeof GameTrophy>;

/** One played title with its lifetime play stats + enrichment. */
export const GamePlay = Schema.Struct({
  titleId: Schema.String,
  name: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  platform: Platform,
  /** Lifetime hours played (psn-api playDuration, converted). */
  hours: Schema.Finite,
  /** Number of distinct play sessions/launches. */
  playCount: Schema.Finite,
  /** ISO date first launched, if known. */
  firstPlayed: Schema.optional(Schema.String),
  /** ISO date most recently launched, if known. */
  lastPlayed: Schema.optional(Schema.String),
  /** Raw psn-api category string (e.g. "ps5_native_game"). */
  category: Schema.optional(Schema.String),
  /** Derived: coarse genre bucket. */
  genre: Genre,
  /** Derived: franchise/series name (e.g. "Call of Duty", "FIFA / EA FC"). */
  franchise: Schema.optional(Schema.String),
  /** RAWG community-average hours to complete this game, when available. */
  typicalPlaytime: Schema.optional(Schema.Finite),
  /** True when this title is a non-game app (YouTube, Netflix…) that should be excluded from play stats. */
  isApp: Schema.Boolean,
  trophy: Schema.optional(GameTrophy),
});
export type GamePlay = Schema.Schema.Type<typeof GamePlay>;

export const DashboardMeta = Schema.Struct({
  totalGames: Schema.Finite,
  totalHours: Schema.Finite,
  totalSessions: Schema.Finite,
  /** Apps (streaming, music, browsers) excluded from the game stats, kept for transparency. */
  appsExcluded: Schema.Array(Schema.Struct({ name: Schema.String, hours: Schema.Finite })),
  /** ISO date of the earliest first-play across the library. */
  firstEverPlayed: Schema.optional(Schema.String),
  /** Overall activity span. */
  span: Schema.Struct({ from: Schema.optional(Schema.String), to: Schema.optional(Schema.String) }),
});
export type DashboardMeta = Schema.Schema.Type<typeof DashboardMeta>;

/** The single object the whole dashboard renders from. */
export const DashboardData = Schema.Struct({
  profile: ProfileSummary,
  /** Games only (apps filtered into meta.appsExcluded), sorted by hours desc. */
  games: Schema.Array(GamePlay),
  /** ISO timestamp the data was fetched. */
  fetchedAt: Schema.String,
  meta: DashboardMeta,
  /** True when this is the bundled demo dataset rather than a live PSN pull. */
  isDemo: Schema.Boolean,
  /**
   * True once the deferred RAWG genre/franchise enrichment has been merged into
   * `games` and persisted to the client cache. Gates the RAWG lookups so a
   * cached account renders without re-hitting RAWG on revisits.
   */
  enriched: Schema.optional(Schema.Boolean),
});
export type DashboardData = Schema.Schema.Type<typeof DashboardData>;
