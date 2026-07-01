/**
 * Pure CSV builders for the dashboard's downloads.
 *
 * The column/type CONTRACT lives in `csv-schema.effect.ts` (pure `effect/Schema`,
 * under the strict Effect glob). This module holds the parts that necessarily
 * touch the domain — the row projections — plus the RFC-4180 string assembly, so
 * those domain imports stay out of the strict Effect program.
 *
 * `buildTransactionsCsv` emits one row per imported transaction (the complete,
 * primary round-trip source). `buildGamesCsv` emits the FULL library: one row
 * per title, every game and every excluded app, discriminated by a `kind`
 * column. `buildAccountCsv` emits the one non-derivable profile row. Together the
 * games + account CSVs are enough to reconstruct the whole `DashboardData` (see
 * `import-dashboard.ts`). Money stays in minor units, dates ISO-8601, ids stable;
 * optional cells blank when absent. Encoding goes through the shared schema, so
 * export and the importer agree by construction.
 */
import type { TransactionRow } from "@/domain/transactions";
import type { GamePlay, ProfileSummary } from "@/server/providers/account/snapshot";
import {
  ACCOUNT_CSV_COLUMNS,
  encodeAccountCsvRow,
  encodeGameCsvRow,
  encodeTransactionCsvRow,
  GAMES_CSV_COLUMNS,
  TRANSACTION_CSV_COLUMNS,
} from "./csv-schema.effect";

/** An excluded app, as carried on `DashboardData.meta.appsExcluded`. */
type AppExcluded = { name: string; hours: number };

/** RFC-4180: quote a cell containing a comma, quote or newline; escape `"` as `""`. */
function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Join already-encoded string cells, ordered by `columns`, into one CSV record. */
function toLine(columns: readonly string[], encoded: Record<string, string>): string {
  return columns.map((column) => escapeCell(encoded[column] ?? "")).join(",");
}

/** RFC-4180 uses CRLF between records; header first, then one line per row. */
function toCsv(header: string, lines: readonly string[]): string {
  return [header, ...lines].join("\r\n");
}

// The row projections return plain domain values; the money/id brands on the
// schema Type are Type-only nominal tags, so `encodeUnknown*` validates and
// brands them without a narrowing cast here.

/** Project a domain transaction onto the header-keyed transactions CSV row. */
function toTransactionCsvRow(tx: TransactionRow) {
  return {
    transaction_id: tx.transactionId,
    key: tx.key,
    date: tx.date,
    transaction_type: tx.transactionType,
    kind: tx.kind,
    product_name: tx.productName,
    sku_id: tx.skuId,
    sku_type: tx.skuType,
    quantity: tx.quantity,
    amount_minor: tx.amountMinor,
    currency: tx.currency,
    display_amount: tx.displayAmount,
    original_price_minor: tx.originalPriceMinor,
    discount_minor: tx.discountMinor,
  };
}

/** Project a played game onto the header-keyed games CSV row (`kind: "game"`). */
function toGameCsvRow(game: GamePlay) {
  const trophy = game.trophy;
  return {
    title_id: game.titleId,
    name: game.name,
    kind: "game",
    platform: game.platform,
    hours: game.hours,
    play_count: game.playCount,
    first_played: game.firstPlayed,
    last_played: game.lastPlayed,
    category: game.category,
    genre: game.genre,
    franchise: game.franchise,
    typical_playtime: game.typicalPlaytime,
    image_url: game.imageUrl,
    trophy_progress: trophy?.progress,
    trophy_earned_platinum: trophy?.earned.platinum,
    trophy_earned_gold: trophy?.earned.gold,
    trophy_earned_silver: trophy?.earned.silver,
    trophy_earned_bronze: trophy?.earned.bronze,
    trophy_total: trophy?.total,
    trophy_has_platinum: trophy?.hasPlatinum,
    trophy_last_earned_at: trophy?.lastEarnedAt,
  };
}

/**
 * Project an excluded app onto the header-keyed games CSV row (`kind: "app"`).
 * Apps carry only a name and hours; every game-only column stays blank.
 */
function toAppCsvRow(app: AppExcluded) {
  return {
    title_id: undefined,
    name: app.name,
    kind: "app",
    platform: undefined,
    hours: app.hours,
    play_count: undefined,
    first_played: undefined,
    last_played: undefined,
    category: undefined,
    genre: undefined,
    franchise: undefined,
    typical_playtime: undefined,
    image_url: undefined,
    trophy_progress: undefined,
    trophy_earned_platinum: undefined,
    trophy_earned_gold: undefined,
    trophy_earned_silver: undefined,
    trophy_earned_bronze: undefined,
    trophy_total: undefined,
    trophy_has_platinum: undefined,
    trophy_last_earned_at: undefined,
  };
}

/** Project a profile onto the one header-keyed account CSV row. */
function toAccountCsvRow(profile: ProfileSummary) {
  return {
    online_id: profile.onlineId,
    account_id: profile.accountId,
    about_me: profile.aboutMe,
    avatar_url: profile.avatarUrl,
    is_plus: profile.isPlus,
    trophy_level: profile.trophyLevel,
    level_progress: profile.levelProgress,
  };
}

/**
 * Build the transactions CSV: one row per imported transaction, encoded through
 * the shared `TransactionCsvRow` schema. The complete, primary round-trip source.
 */
export function buildTransactionsCsv(transactions: readonly TransactionRow[]): string {
  const header = TRANSACTION_CSV_COLUMNS.join(",");
  const lines = transactions.map((tx) => {
    const cells: Record<string, string> = encodeTransactionCsvRow(toTransactionCsvRow(tx));
    return toLine(TRANSACTION_CSV_COLUMNS, cells);
  });
  return toCsv(header, lines);
}

/**
 * Build the games CSV: the FULL library, one row per title. Every game is
 * emitted as a `kind: "game"` row carrying its full shape; every excluded app is
 * emitted as a `kind: "app"` row carrying only name and hours. Encoded through
 * the shared `GameCsvRow` schema, so the importer reconstructs the split.
 */
export function buildGamesCsv(
  games: readonly GamePlay[],
  appsExcluded: readonly AppExcluded[]
): string {
  const header = GAMES_CSV_COLUMNS.join(",");
  const gameLines = games.map((game) =>
    toLine(GAMES_CSV_COLUMNS, encodeGameCsvRow(toGameCsvRow(game)))
  );
  const appLines = appsExcluded.map((app) =>
    toLine(GAMES_CSV_COLUMNS, encodeGameCsvRow(toAppCsvRow(app)))
  );
  return toCsv(header, [...gameLines, ...appLines]);
}

/**
 * Build the account CSV: one row of the non-derivable profile fields, encoded
 * through the shared `AccountCsvRow` schema. Trophy totals and the demo flags are
 * intentionally omitted — the importer derives/sets them.
 */
export function buildAccountCsv(profile: ProfileSummary): string {
  const header = ACCOUNT_CSV_COLUMNS.join(",");
  return toCsv(header, [
    toLine(ACCOUNT_CSV_COLUMNS, encodeAccountCsvRow(toAccountCsvRow(profile))),
  ]);
}
