/**
 * Reconstruct a whole `DashboardData` from the games + account CSVs (#312).
 *
 * The inverse of the `csv.ts` builders: parse each CSV with the shared
 * {@link parseCsv}, decode the rows through the header-keyed schemas in
 * `csv-schema.effect.ts`, then reassemble the dashboard.
 *
 * The two CSVs are the NON-DERIVABLE inputs; everything else is recomputed here,
 * so the two layers can never drift:
 * - `games` are the `kind: "game"` rows (mapped back to `isApp: false`);
 *   `meta.appsExcluded` are the `kind: "app"` rows (name + hours only), matching
 *   the model where the games array excludes apps.
 * - `profile.earned` / `profile.totalTrophies` are DERIVED by summing the game
 *   trophy rows, not stored on the account CSV.
 * - `meta.totalGames/totalHours/totalSessions`, `firstEverPlayed`, and `span`
 *   are recomputed with the same shared {@link computeTotals} the server uses.
 * - `isDemo`/`trophiesUnavailable` are `false` — imported data is a real pull —
 *   and `fetchedAt` is stamped now (it is not carried on either CSV).
 *
 * The assembled object is validated against the `DashboardData` schema before it
 * is returned, so a malformed CSV (bad genre, missing required column, non-numeric
 * cell) surfaces as a clear decode error rather than a corrupt dashboard.
 */
import * as Schema from "effect/Schema";
import { computeTotals, type TotalsInput } from "@/domain/totals";
import type {
  DashboardData as DashboardDataType,
  TrophyCounts,
} from "@/server/providers/account/snapshot";
import { DashboardData } from "@/server/providers/account/snapshot";
import { parseCsv } from "./csv-parse";
import { AccountCsvRow, GameCsvRow } from "./csv-schema.effect";

const decodeAccountRow = Schema.decodeUnknownSync(AccountCsvRow);
const decodeGameRow = Schema.decodeUnknownSync(GameCsvRow);
const decodeDashboard = Schema.decodeUnknownSync(DashboardData);

type GameRow = typeof GameCsvRow.Type;
type AccountRow = typeof AccountCsvRow.Type;
type AppExcluded = { name: string; hours: number };

/** Drop `undefined`-valued keys so optional fields reconstruct as absent, not `undefined`. */
function dropUndefined(object: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** A game row's earned trophy counts, blank cells reading as zero. */
function earnedFrom(row: GameRow): TrophyCounts {
  return {
    platinum: row.trophy_earned_platinum ?? 0,
    gold: row.trophy_earned_gold ?? 0,
    silver: row.trophy_earned_silver ?? 0,
    bronze: row.trophy_earned_bronze ?? 0,
  };
}

/** Reconstruct a game row's flattened trophy columns, or `undefined` when absent. */
function trophyFrom(row: GameRow): Record<string, unknown> | undefined {
  if (row.trophy_progress === undefined) return undefined;
  return dropUndefined({
    progress: row.trophy_progress,
    earned: earnedFrom(row),
    total: row.trophy_total ?? 0,
    hasPlatinum: row.trophy_has_platinum ?? false,
    lastEarnedAt: row.trophy_last_earned_at,
  });
}

/** Map a `kind: "game"` row back to a `GamePlay`-shaped object (apps excluded). */
function gameFrom(row: GameRow): Record<string, unknown> {
  return dropUndefined({
    titleId: row.title_id,
    name: row.name,
    imageUrl: row.image_url,
    platform: row.platform,
    hours: row.hours,
    playCount: row.play_count,
    firstPlayed: row.first_played,
    lastPlayed: row.last_played,
    category: row.category,
    genre: row.genre,
    franchise: row.franchise,
    typicalPlaytime: row.typical_playtime,
    isApp: false,
    trophy: trophyFrom(row),
  });
}

/** The subset of a game row the shared totals need. */
function totalsInput(row: GameRow): TotalsInput {
  return {
    hours: row.hours,
    playCount: row.play_count ?? 0,
    firstPlayed: row.first_played,
    lastPlayed: row.last_played,
  };
}

/** Sum the per-game earned trophy counts into the account-level `TrophyCounts`. */
function sumEarned(gameRows: readonly GameRow[]): TrophyCounts {
  const total = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const row of gameRows) {
    if (row.trophy_progress === undefined) continue;
    const earned = earnedFrom(row);
    total.platinum += earned.platinum;
    total.gold += earned.gold;
    total.silver += earned.silver;
    total.bronze += earned.bronze;
  }
  return total;
}

/** Collect the `kind: "app"` rows into the `meta.appsExcluded` shape (name + hours). */
function appsFrom(rows: readonly GameRow[]): AppExcluded[] {
  const apps: AppExcluded[] = [];
  for (const row of rows) {
    if (row.kind === "app") apps.push({ name: row.name, hours: row.hours });
  }
  return apps;
}

/** Reconstruct the profile row, deriving the account-level earned totals. */
function profileFrom(account: AccountRow, earned: TrophyCounts): Record<string, unknown> {
  return dropUndefined({
    onlineId: account.online_id,
    accountId: account.account_id,
    aboutMe: account.about_me,
    avatarUrl: account.avatar_url,
    isPlus: account.is_plus,
    trophyLevel: account.trophy_level,
    levelProgress: account.level_progress,
    earned,
    totalTrophies: earned.platinum + earned.gold + earned.silver + earned.bronze,
  });
}

/** Recompute the dashboard meta from the game rows and the excluded apps. */
function metaFrom(
  gameRows: readonly GameRow[],
  appsExcluded: AppExcluded[]
): Record<string, unknown> {
  const totals = computeTotals(gameRows.map(totalsInput));
  return dropUndefined({
    totalGames: totals.totalGames,
    totalHours: totals.totalHours,
    totalSessions: totals.totalSessions,
    appsExcluded,
    firstEverPlayed: totals.firstEverPlayed,
    span: dropUndefined(totals.span),
  });
}

/** Decode the single account row, or throw a clear error when it is missing. */
function decodeAccount(accountCsv: string): AccountRow {
  const row = parseCsv(accountCsv).rows[0];
  if (row === undefined) {
    throw new Error("Account CSV has no data row — expected one profile row.");
  }
  return decodeAccountRow(row);
}

/**
 * Rebuild a `DashboardData` from the games + account CSV text and validate it.
 * Throws a decode error when the account CSV has no row or either CSV is
 * malformed against its schema.
 */
export function importDashboardFromCsv(gamesCsv: string, accountCsv: string): DashboardDataType {
  const account = decodeAccount(accountCsv);
  const rows = parseCsv(gamesCsv).rows.map((row) => decodeGameRow(row));
  const gameRows = rows.filter((row) => row.kind === "game");
  const earned = sumEarned(gameRows);
  return decodeDashboard({
    profile: profileFrom(account, earned),
    games: gameRows.map(gameFrom),
    fetchedAt: new Date().toISOString(),
    meta: metaFrom(gameRows, appsFrom(rows)),
    isDemo: false,
    trophiesUnavailable: false,
  });
}
