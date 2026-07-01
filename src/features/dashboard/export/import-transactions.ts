/**
 * Import a transactions CSV (the one `buildTransactionsCsv` exports) back into
 * the transaction store — the inverse of the export, closing the round-trip.
 *
 * Each record is decoded through the shared `TransactionCsvRow` schema (so a bad
 * number/date or a missing required column surfaces as a typed `SchemaError`
 * rather than a crash), projected back onto a domain {@link TransactionRow}, then
 * merged into any existing import and persisted. De-duping mirrors the bookmarklet
 * handoff (`receiveHandoff`): the stable per-line {@link TransactionRow.key} is the
 * identity, so re-importing the same file is idempotent and multi-line purchases
 * (which share a transaction id across product lines) are preserved losslessly.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { TransactionImport, TransactionRow } from "@/domain/transactions";
import type { TransactionStore } from "@/stores/transactions-store";
import { parseCsv } from "./csv-parse";
import { TransactionCsvRow } from "./csv-schema.effect";

/** Source label for an import that came from a restored CSV file, not a fetch. */
const CSV_IMPORT_SOURCE = "CSV import";

const decodeRow = Schema.decodeUnknownEffect(TransactionCsvRow);

/** The outcome of a CSV import, for the UI toast. */
export interface CsvImportSummary {
  /** Rows read and decoded from the CSV file. */
  parsed: number;
  /** Rows newly added after de-duping against the existing import. */
  added: number;
  /** Total transactions persisted after the merge. */
  total: number;
}

/** Project a decoded CSV row back onto its domain transaction row. */
function toTransactionRow(row: Schema.Schema.Type<typeof TransactionCsvRow>): TransactionRow {
  return {
    transactionId: row.transaction_id,
    key: row.key,
    date: row.date,
    transactionType: row.transaction_type,
    // `kind` round-trips as a plain cell; the exporter only ever writes the two
    // domain literals, so restore it to the narrowed union without a cast.
    kind: row.kind === "top-up" ? "top-up" : "purchase",
    productName: row.product_name,
    skuId: row.sku_id,
    skuType: row.sku_type,
    quantity: row.quantity,
    amountMinor: row.amount_minor,
    currency: row.currency,
    displayAmount: row.display_amount,
    originalPriceMinor: row.original_price_minor,
    discountMinor: row.discount_minor,
  };
}

/** Keep the first row for each {@link TransactionRow.key}, preserving order. */
function dedupeByKey(rows: readonly TransactionRow[]): TransactionRow[] {
  const seen = new Set<string>();
  const unique: TransactionRow[] = [];
  for (const tx of rows) {
    if (seen.has(tx.key)) continue;
    seen.add(tx.key);
    unique.push(tx);
  }
  return unique;
}

/**
 * Merge incoming rows into the existing import, de-duping by {@link
 * TransactionRow.key}. Existing rows keep their order and win over an incoming
 * duplicate; genuinely new rows append in file order.
 */
function mergeTransactions(
  existing: TransactionImport | null,
  incoming: readonly TransactionRow[]
): { transactions: TransactionRow[]; added: number; source: string } {
  const base = dedupeByKey(existing?.transactions ?? []);
  const transactions = dedupeByKey([...base, ...incoming]);
  return {
    transactions,
    added: transactions.length - base.length,
    source: existing?.source ?? CSV_IMPORT_SOURCE,
  };
}

/**
 * Parse, validate, merge and persist a transactions CSV. Fails with a {@link
 * Schema.SchemaError} when any record does not match the transactions contract
 * (bad number/date, missing required column), leaving the store untouched.
 */
export function importTransactionsCsv(
  store: TransactionStore,
  text: string
): Effect.Effect<CsvImportSummary, Schema.SchemaError> {
  return Effect.gen(function* () {
    const { rows } = parseCsv(text);
    const decoded = yield* Effect.forEach(rows, (row) => decodeRow(row));
    const incoming = decoded.map(toTransactionRow);
    const merged = mergeTransactions(store.load(), incoming);
    store.save({
      transactions: merged.transactions,
      importedAt: new Date().toISOString(),
      source: merged.source,
    });
    return { parsed: incoming.length, added: merged.added, total: merged.transactions.length };
  });
}
