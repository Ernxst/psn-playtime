/**
 * CSV export contracts + pure builders for the dashboard's two downloads.
 *
 * Each CSV is one header-keyed `Schema.Struct` (`TransactionCsvRow`,
 * `GameCsvRow`): the struct's field KEYS are the exact CSV column headers
 * (snake_case), and `Schema` preserves field order, so the header row is DERIVED
 * from the struct — there is no separate header list to drift. Each field is a
 * string ⇄ typed transform: the Encoded side is always a string cell, the Type
 * side is the typed value (money in minor units as integers, counts as numbers,
 * ISO-8601 dates and stable ids as strings). Optional columns encode an absent
 * value as the blank cell `""` and decode `""` back to `undefined`.
 *
 * This one schema is the shared round-trip contract: `Schema.encode` is export,
 * `Schema.decode` is the future importer (#312) — name-keyed, so reordered/extra
 * columns are tolerated. A round-trip test proves encode → cells → decode.
 *
 * Kept as plain `.ts` (not `.effect.ts`): it reuses the non-Effect `matchGame`
 * and imports the deliberately dependency-light domain modules (`transactions`,
 * `snapshot`), which the strict `.effect.ts` glob would flag under rules like
 * `globalDate`/`strictBooleanExpressions`. Dates stay ISO-8601 STRINGS (already
 * round-trip-safe) rather than a `Date` transform. Encoding is synchronous
 * `Schema`; the RFC-4180 string assembly is a small pure helper, no runtime.
 */
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import type { TransactionRow } from "@/domain/transactions";
import { indexByName, matchGame } from "@/features/dashboard/spend/spend";
import type { GamePlay } from "@/server/providers/account/snapshot";

/** A required text cell: the string survives verbatim in both directions. */
const TextCell = Schema.String;

/**
 * A required numeric cell (minor units, counts, hours) carried as its decimal
 * string in the CSV. `NumberFromString` is the round-trip: `1599` ⇄ `"1599"`.
 */
const NumberCell = Schema.NumberFromString;

/** An optional text cell: an absent value is the blank cell `""`, and vice-versa. */
const OptionalTextCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : cell)),
    encode: SchemaGetter.transform((value: string | undefined) => value ?? ""),
  })
);

/** An optional numeric cell: an absent value is the blank cell `""`, never `0`. */
const OptionalNumberCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Number), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : Number(cell))),
    encode: SchemaGetter.transform((value: number | undefined) =>
      value === undefined ? "" : String(value)
    ),
  })
);

/** An optional boolean cell: absent is `""`, present is `"true"`/`"false"`. */
const OptionalBooleanCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Boolean), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : cell === "true")),
    encode: SchemaGetter.transform((value: boolean | undefined) =>
      value === undefined ? "" : String(value)
    ),
  })
);

/**
 * The transactions CSV row contract: one row per imported {@link TransactionRow},
 * the complete round-trip source (purchases, top-ups, subscriptions). The field
 * keys are the CSV headers and their order is the column order.
 */
export const TransactionCsvRow = Schema.Struct({
  transaction_id: TextCell,
  key: TextCell,
  date: TextCell,
  transaction_type: TextCell,
  kind: TextCell,
  product_name: TextCell,
  sku_id: OptionalTextCell,
  sku_type: OptionalTextCell,
  quantity: NumberCell,
  amount_minor: NumberCell,
  currency: TextCell,
  display_amount: TextCell,
  original_price_minor: OptionalNumberCell,
  discount_minor: OptionalNumberCell,
});
export type TransactionCsvRow = Schema.Schema.Type<typeof TransactionCsvRow>;

/**
 * The games CSV row contract: the subset of transaction rows that matched a
 * library game, each enriched with that game's fields. Base game and every
 * add-on/DLC is its own row carrying the matched game's metadata. `amount_minor`
 * is the price paid; `original_price_minor` is the pre-discount price (blank when
 * the import did not carry it). The field keys are the CSV headers and their
 * order is the column order.
 */
export const GameCsvRow = Schema.Struct({
  transaction_id: TextCell,
  key: TextCell,
  date: TextCell,
  transaction_type: TextCell,
  kind: TextCell,
  product_name: TextCell,
  sku_id: OptionalTextCell,
  sku_type: OptionalTextCell,
  quantity: NumberCell,
  amount_minor: NumberCell,
  original_price_minor: OptionalNumberCell,
  discount_minor: OptionalNumberCell,
  currency: TextCell,
  title_id: TextCell,
  game_name: TextCell,
  platform: TextCell,
  hours: NumberCell,
  play_count: NumberCell,
  first_played: OptionalTextCell,
  last_played: OptionalTextCell,
  genre: TextCell,
  franchise: OptionalTextCell,
  typical_playtime: OptionalNumberCell,
  trophy_progress: OptionalNumberCell,
  trophy_earned_platinum: OptionalNumberCell,
  trophy_earned_gold: OptionalNumberCell,
  trophy_earned_silver: OptionalNumberCell,
  trophy_earned_bronze: OptionalNumberCell,
  trophy_has_platinum: OptionalBooleanCell,
});
export type GameCsvRow = Schema.Schema.Type<typeof GameCsvRow>;

/** Transactions CSV column headers, in order, derived from the schema field keys. */
export const TRANSACTION_CSV_COLUMNS = Object.keys(TransactionCsvRow.fields);

/** Games CSV column headers, in order, derived from the schema field keys. */
export const GAMES_CSV_COLUMNS = Object.keys(GameCsvRow.fields);

const encodeTransactionRow = Schema.encodeSync(TransactionCsvRow);
const encodeGameRow = Schema.encodeSync(GameCsvRow);

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

/** Project a domain transaction onto the header-keyed transactions CSV row. */
function toTransactionCsvRow(tx: TransactionRow): TransactionCsvRow {
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

/** Project a matched (transaction, game) pair onto the header-keyed games CSV row. */
function toGameCsvRow(tx: TransactionRow, game: GamePlay): GameCsvRow {
  const trophy = game.trophy;
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
    original_price_minor: tx.originalPriceMinor,
    discount_minor: tx.discountMinor,
    currency: tx.currency,
    title_id: game.titleId,
    game_name: game.name,
    platform: game.platform,
    hours: game.hours,
    play_count: game.playCount,
    first_played: game.firstPlayed,
    last_played: game.lastPlayed,
    genre: game.genre,
    franchise: game.franchise,
    typical_playtime: game.typicalPlaytime,
    trophy_progress: trophy?.progress,
    trophy_earned_platinum: trophy?.earned.platinum,
    trophy_earned_gold: trophy?.earned.gold,
    trophy_earned_silver: trophy?.earned.silver,
    trophy_earned_bronze: trophy?.earned.bronze,
    trophy_has_platinum: trophy?.hasPlatinum,
  };
}

/**
 * Build the transactions CSV: one row per imported transaction, encoded through
 * {@link TransactionCsvRow}. This is the complete, primary round-trip source.
 */
export function buildTransactionsCsv(transactions: readonly TransactionRow[]): string {
  const header = TRANSACTION_CSV_COLUMNS.join(",");
  const lines = transactions.map((tx) => {
    const cells: Record<string, string> = encodeTransactionRow(toTransactionCsvRow(tx));
    return toLine(TRANSACTION_CSV_COLUMNS, cells);
  });
  return toCsv(header, lines);
}

/**
 * Build the games CSV: the subset of transaction rows that matched a library
 * game (via the shared {@link matchGame}), each enriched with the game's fields
 * and encoded through {@link GameCsvRow}. Unmatched rows are omitted.
 */
export function buildGamesCsv(
  transactions: readonly TransactionRow[],
  games: readonly GamePlay[]
): string {
  const byName = indexByName(games);
  const header = GAMES_CSV_COLUMNS.join(",");
  const lines: string[] = [];
  for (const tx of transactions) {
    const game = matchGame(tx, games, byName);
    if (game === undefined) continue;
    const cells: Record<string, string> = encodeGameRow(toGameCsvRow(tx, game));
    lines.push(toLine(GAMES_CSV_COLUMNS, cells));
  }
  return toCsv(header, lines);
}
