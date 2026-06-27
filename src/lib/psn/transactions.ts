/**
 * Transaction-history domain: parsing the rows scraped from the PlayStation
 * order/transaction-history page, and the one-click handoff payload the
 * bookmarklet hands to the app.
 *
 * PSN has no clean API for spend history, so the data is scraped client-side by
 * a bookmarklet (see `transaction-bookmarklet.ts`) running on the user's own
 * already-authenticated order page. The bookmarklet only scrapes *raw* text
 * rows — all parsing/classification lives here so it is testable in node and the
 * bookmarklet string stays minimal.
 *
 * Keep this file dependency-light (zod only) so both the route and the store can
 * import it cheaply.
 */
import { z } from "zod";

/** A wallet top-up vs an actual purchase/spend. */
export type TransactionKind = "top-up" | "purchase";

/** A single raw row as scraped from a `.transaction-history-card` (text only). */
export interface RawTransactionRow {
  /** Raw date text, e.g. "12 May 2023", "May 12, 2023" or "12/05/2023". */
  date: string;
  /** Raw amount text, e.g. "-£33.00" or "£10.00". */
  amount: string;
  /** Raw description/title text. */
  description: string;
}

/** A parsed, normalised transaction. */
export interface Transaction {
  /** `YYYY-MM-DD` when parseable, otherwise the trimmed original date text. */
  date: string;
  description: string;
  /** Absolute value in the major currency unit (always >= 0). */
  amount: number;
  /** Currency symbol or code as it appeared, e.g. "£". */
  currency: string;
  kind: TransactionKind;
}

/** The persisted, parsed import. */
export interface TransactionImport {
  transactions: Transaction[];
  /** ISO timestamp the data was imported into the app. */
  importedAt: string;
  /** Host the data was scraped from, for transparency. */
  source: string;
}

/** Current handoff payload version. Bump if the wire shape changes. */
export const HANDOFF_VERSION = 1;

/** The payload the bookmarklet hands to `/import` via the URL fragment. */
export interface HandoffPayload {
  v: typeof HANDOFF_VERSION;
  /** Host the rows were scraped from. */
  source: string;
  /** ISO timestamp the rows were scraped. */
  scrapedAt: string;
  rows: RawTransactionRow[];
}

/** Description keywords that mark a row as a wallet top-up rather than a spend. */
const TOP_UP_PATTERNS: RegExp[] = [
  /wallet/i,
  /add(?:ing|ed)?\s+funds/i,
  /funds?\s+added/i,
  /top[\s-]?up/i,
  /voucher/i,
  /psn\s+card/i,
  /gift\s+card/i,
];

/**
 * Parse an amount string into an absolute value + currency symbol.
 * Returns `null` when no monetary value can be found.
 */
function toNumber(digits: string): number | null {
  // Strip thousands separators, keep the last separator as the decimal point.
  const normalised = digits.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number.parseFloat(normalised);
  return Number.isNaN(value) ? null : Math.abs(value);
}

export function parseAmount(raw: string): { value: number; currency: string } | null {
  const match = /([£$€]|US\$|[A-Z]{3})?\s*-?\s*([£$€])?\s*([\d.,]+)/.exec(raw.trim());
  if (!match) return null;
  const value = toNumber(match[3]!);
  if (value === null) return null;
  return { value, currency: match[1] ?? match[2] ?? "" };
}

/** Classify a row as a top-up or a purchase from its description. */
export function classifyKind(description: string): TransactionKind {
  return TOP_UP_PATTERNS.some((pattern) => pattern.test(description)) ? "top-up" : "purchase";
}

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;
const UK_NUMERIC = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Normalise a raw date to `YYYY-MM-DD`, falling back to the trimmed original. */
export function toISODate(raw: string): string {
  const text = raw.trim();

  const iso = ISO_DATE.exec(text);
  if (iso) return iso[1]!;

  // UK order pages render `DD/MM/YYYY` — parse explicitly to avoid US ambiguity.
  const uk = UK_NUMERIC.exec(text);
  if (uk) {
    const [, day, month, year] = uk;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  // "12 May 2023" / "May 12, 2023" and similar are handled by the Date parser.
  // These parse to *local* midnight, so format from local parts to avoid a
  // timezone shifting the calendar day.
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${parsed.getFullYear()}-${month}-${day}`;
  }

  return text;
}

/**
 * Parse raw scraped rows into normalised transactions. Rows without a parseable
 * monetary amount are dropped (e.g. headers or malformed cards).
 */
export function parseTransactions(rows: RawTransactionRow[]): Transaction[] {
  const transactions: Transaction[] = [];
  for (const row of rows) {
    const parsed = parseAmount(row.amount);
    if (!parsed || parsed.value === 0) continue;
    const description = row.description.trim();
    transactions.push({
      date: toISODate(row.date),
      description,
      amount: parsed.value,
      currency: parsed.currency,
      kind: classifyKind(description),
    });
  }
  return transactions;
}

const rawRowSchema = z.object({
  date: z.string(),
  amount: z.string(),
  description: z.string(),
});

const handoffSchema = z.object({
  v: z.literal(HANDOFF_VERSION),
  source: z.string(),
  scrapedAt: z.string(),
  rows: z.array(rawRowSchema),
});

/** Fragment key carrying the handoff payload (`#data=...`). */
export const HANDOFF_FRAGMENT_KEY = "data";

/** Encode a handoff payload into a `data=...` URL-fragment body. */
export function encodeHandoff(payload: HandoffPayload): string {
  return `${HANDOFF_FRAGMENT_KEY}=${encodeURIComponent(JSON.stringify(payload))}`;
}

/**
 * Decode a `location.hash` fragment into a validated handoff payload.
 * Returns `null` for a missing/malformed/invalid fragment.
 */
function readFragment(hash: string): string | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = `${HANDOFF_FRAGMENT_KEY}=`;
  if (!fragment.startsWith(prefix)) return null;
  const encoded = fragment.slice(prefix.length);
  return encoded === "" ? null : encoded;
}

export function decodeHandoff(hash: string): HandoffPayload | null {
  const encoded = readFragment(hash);
  if (encoded === null) return null;
  try {
    const parsed = handoffSchema.safeParse(JSON.parse(decodeURIComponent(encoded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
