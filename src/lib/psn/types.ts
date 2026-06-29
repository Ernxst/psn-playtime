/**
 * The contract between the data layer and the UI.
 *
 * The server (`src/server/psn/psn-account-provider.effect.ts`) fetches from PSN via psn-api and normalizes
 * everything into a single `DashboardData` object. The UI (`src/lib/psn/analytics.ts`
 * + components) only ever consumes `DashboardData` — it never touches psn-api.
 *
 * Keep this file dependency-free so both sides can import it cheaply.
 */

export type Platform = "PS5" | "PS4" | "PS3" | "PSVITA" | "OTHER";

/** A coarse genre bucket used for the "what kind of player are you" breakdowns. */
export type Genre =
  | "Shooter"
  | "Sports"
  | "RPG"
  | "Action-Adventure"
  | "Survival/Craft"
  | "Racing"
  | "Fighting"
  | "Indie/Casual"
  | "Open World"
  | "Other";

export interface TrophyCounts {
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface ProfileSummary {
  onlineId: string;
  accountId: string;
  aboutMe?: string;
  avatarUrl?: string;
  isPlus: boolean;
  /** PSN trophy level (e.g. 220). */
  trophyLevel: number;
  /** Percent progress toward the next trophy level (0–100). */
  levelProgress: number;
  earned: TrophyCounts;
  /** Sum of all earned trophies. */
  totalTrophies: number;
}

/** Per-game trophy progress, when available. */
export interface GameTrophy {
  /** 0–100 completion of the trophy list. */
  progress: number;
  earned: TrophyCounts;
  total: number;
  hasPlatinum: boolean;
  /** ISO date of the most recently earned trophy in this game, if any. */
  lastEarnedAt?: string;
}

/** One played title with its lifetime play stats + enrichment. */
export interface GamePlay {
  titleId: string;
  name: string;
  imageUrl?: string;
  platform: Platform;
  /** Lifetime hours played (psn-api playDuration, converted). */
  hours: number;
  /** Number of distinct play sessions/launches. */
  playCount: number;
  /** ISO date first launched, if known. */
  firstPlayed?: string;
  /** ISO date most recently launched, if known. */
  lastPlayed?: string;
  /** Raw psn-api category string (e.g. "ps5_native_game"). */
  category?: string;
  /** Derived: coarse genre bucket. */
  genre: Genre;
  /** Derived: franchise/series name (e.g. "Call of Duty", "FIFA / EA FC"). */
  franchise?: string;
  /** RAWG community-average hours to complete this game, when available. */
  typicalPlaytime?: number;
  /** True when this title is a non-game app (YouTube, Netflix…) that should be excluded from play stats. */
  isApp: boolean;
  trophy?: GameTrophy;
}

export interface DashboardMeta {
  totalGames: number;
  totalHours: number;
  totalSessions: number;
  /** Apps (streaming, music, browsers) excluded from the game stats, kept for transparency. */
  appsExcluded: Array<{ name: string; hours: number }>;
  /** ISO date of the earliest first-play across the library. */
  firstEverPlayed?: string;
  /** Overall activity span. */
  span: { from?: string; to?: string };
}

/** The single object the whole dashboard renders from. */
export interface DashboardData {
  profile: ProfileSummary;
  /** Games only (apps filtered into meta.appsExcluded), sorted by hours desc. */
  games: GamePlay[];
  /** ISO timestamp the data was fetched. */
  fetchedAt: string;
  meta: DashboardMeta;
  /** True when this is the bundled demo dataset rather than a live PSN pull. */
  isDemo: boolean;
  /**
   * True once the deferred RAWG genre/franchise enrichment has been merged into
   * `games` and persisted to the client cache. Gates the RAWG lookups so a
   * cached account renders without re-hitting RAWG on revisits.
   */
  enriched?: boolean;
}
