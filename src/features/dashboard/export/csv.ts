/**
 * Pure CSV builders for the dashboard's two downloads.
 *
 * The column/type CONTRACT lives in `csv-schema.effect.ts` (pure `effect/Schema`,
 * under the strict Effect glob). This module holds the parts that necessarily
 * touch the domain — the row projections and the transaction→game join (reusing
 * the spend view's `matchGame`) — plus the RFC-4180 string assembly, so those
 * domain imports stay out of the strict Effect program.
 *
 * `buildTransactionsCsv` emits one row per imported transaction (the complete,
 * primary round-trip source). `buildGamesCsv` emits the subset matched to a
 * library game, each enriched with the game's fields. Money stays in minor
 * units, dates ISO-8601, ids stable; optional cells blank when absent. Encoding
 * goes through the shared schema, so export and the future importer (#312) agree
 * by construction.
 */
import type { TransactionRow } from "@/domain/transactions";
import { indexByName, matchGame } from "@/features/dashboard/spend/spend";
import type { GamePlay } from "@/server/providers/account/snapshot";
import {
  encodeGameCsvRow,
  encodeTransactionCsvRow,
  GAMES_CSV_COLUMNS,
  type GameCsvRow,
  TRANSACTION_CSV_COLUMNS,
  type TransactionCsvRow,
} from "./csv-schema.effect";

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
 * Build the games CSV: the subset of transaction rows that matched a library
 * game (via the shared {@link matchGame}), each enriched with the game's fields
 * and encoded through the shared `GameCsvRow` schema. Unmatched rows are omitted.
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
    const cells: Record<string, string> = encodeGameCsvRow(toGameCsvRow(tx, game));
    lines.push(toLine(GAMES_CSV_COLUMNS, cells));
  }
  return toCsv(header, lines);
}
