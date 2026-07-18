/**
 * Transaction-history domain: flattening the rows the bookmarklet replays from
 * the PlayStation `transactionHistoryRetrieve` GraphQL API, and the one-click
 * handoff payload the bookmarklet hands to the app.
 *
 * PSN has no public spend API, so the data is replayed client-side by a
 * bookmarklet (see `transaction-bookmarklet.ts`) running on a logged-in
 * `playstation.com` page (cookie-authenticated). The bookmarklet flattens the
 * raw GraphQL nodes into compact {@link TransactionRow}s (these helpers are
 * embedded into the bookmarklet via `toString()`), then hands them to `/import`
 * inside the opened tab's own URL fragment — no cross-window messaging, so it
 * survives the app's `Cross-Origin-Opener-Policy: same-origin`.
 *
 * Keep this file dependency-light (effect's `Schema` only) so both the route and
 * the store can import it cheaply.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** A wallet/balance movement vs an actual product purchase/spend. */
type TransactionKind = "top-up" | "purchase";

/**
 * One flattened transaction line. Purchases produce one row per product; other
 * transactions (wallet funding, refunds, adjustments) produce a single row.
 */
export interface TransactionRow {
  /** PSN transaction id (shared by every product line of a purchase). */
  transactionId: string;
  /** Stable per-line key for de-duping across re-imports. */
  key: string;
  /** ISO timestamp of the transaction. */
  date: string;
  /** Raw PSN transaction type, e.g. "PRODUCT_PURCHASE" or "CYCLE_SUBSCRIPTION". */
  transactionType: string;
  /** Classification used by the spend view. */
  kind: TransactionKind;
  /** Exact product name (purchase), else the transaction type label. */
  productName: string;
  /** Stable PSN sku id, e.g. "EP0006-PPSA06092_00-WRC2023PS5GAME00-E004". */
  skuId?: string;
  /** "STANDARD" | "PRE_ORDER" | "SUBSCRIPTION" | add-on type, for product lines. */
  skuType?: string;
  quantity: number;
  /** Amount paid for this line, in minor currency units (always >= 0). */
  amountMinor: number;
  /** Currency symbol or code as it appeared, e.g. "£". */
  currency: string;
  /** Formatted amount as PSN rendered it, e.g. "£4.49". */
  displayAmount: string;
  /** Pre-discount price in minor units, when known. */
  originalPriceMinor?: number;
  /** Discount applied in minor units, when known. */
  discountMinor?: number;
}

/** The persisted, parsed import. */
export interface TransactionImport {
  transactions: TransactionRow[];
  /** ISO timestamp the data was imported into the app. */
  importedAt: string;
  /** Host the data was fetched from, for transparency. */
  source: string;
}

/** Current handoff payload version. Bump if the wire shape changes. */
export const HANDOFF_VERSION = 4;

/** Fragment key carrying the handoff payload (`#data=...`). */
export const HANDOFF_FRAGMENT_KEY = "data";

/** A single raw `productPurchases[]` entry from the GraphQL response. */
export interface ApiProductPurchase {
  /** Null for delisted products (the persisted query declares it non-null). */
  productName?: string | null;
  skuId?: string;
  skuType?: string;
  quantity?: number;
  total?: number;
  totalFormatted?: string;
  originalPrice?: number;
  discount?: number;
  orderItemId?: string;
}

/** A single raw `transactions[]` node from `transactionHistoryRetrieve`. */
export interface ApiTransaction {
  id: string;
  date: string;
  transactionType: string;
  invoiceType?: string;
  displayOfTransactionValue?: string;
  purchaseDetails?: { productPurchases: ApiProductPurchase[] } | null;
}

/** The compact payload the bookmarklet hands to `/import` via the URL fragment. */
export interface HandoffPayload {
  v: typeof HANDOFF_VERSION;
  /** Stable PSN account id selected when the bookmarklet was created. */
  accountId: string;
  /** Host the transactions were fetched from. */
  source: string;
  /** ISO timestamp the transactions were fetched. */
  fetchedAt: string;
  /** Already-flattened rows (flattening runs on the bookmarklet side). */
  transactions: TransactionRow[];
}

/**
 * Normalise a product name. PlayStation leaves HTML entities in some titles
 * (e.g. `EA SPORTS FC™ 26 Standard Edition PS4 &amp; PS5`); decode the handful it
 * emits and collapse whitespace. Trademark glyphs (`™ ®`) are preserved.
 *
 * Fully self-contained — the entity map is a local const, so it references no
 * module-scope identifier and survives `toString()` embedding into the
 * bookmarklet even after the app bundle minifies (and renames) module bindings.
 */
export function normaliseProductName(raw: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
  };
  return raw
    .replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Currency symbol/code from a formatted amount, or "" when none is present.
 *
 * Fully self-contained — the currency pattern is a local regex, so it references
 * no module-scope identifier and survives `toString()` embedding into the
 * bookmarklet even after minification renames module bindings.
 */
export function currencySymbol(formatted: string): string {
  const currency = /US\$|[£$€]|[A-Z]{3}/;
  const match = currency.exec(formatted);
  return match ? match[0] : "";
}

/**
 * Parse a formatted amount like "£10.00" into absolute minor units + currency.
 *
 * Handles both number groupings: English ("." decimal, "," thousands — e.g.
 * "£1,234.56") and European ("," decimal, "." thousands — e.g. "€1.234,56").
 * When both separators appear, the last-occurring one is the decimal point and
 * the other is a thousands separator. When only one separator appears, it is a
 * thousands separator if it repeats or groups exactly three trailing digits
 * (e.g. "1.234", "1,234,567"); otherwise it is the decimal point.
 *
 * Self-contained (only browser globals besides {@link currencySymbol}, which is
 * also embedded) so it survives `toString()` embedding into the bookmarklet.
 */
export function parseDisplayAmount(formatted: string): { minor: number; currency: string } {
  const currency = currencySymbol(formatted);
  const digits = formatted.replace(/[^\d.,]/g, "");
  // The last "." or "," is the decimal point unless it groups exactly three
  // trailing digits, in which case it is a thousands separator (so "1.234" and
  // "1,234" are 1234, while "1.23" and "1,23" are 1.23). All other separators
  // are thousands groupings and are stripped.
  const separator = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  const fraction = digits.length - separator - 1;
  const plainDigits = digits.replace(/[.,]/g, "");
  const cut = separator >= 0 && fraction !== 3 ? plainDigits.length - fraction : plainDigits.length;
  const normalised = `${plainDigits.slice(0, cut)}.${plainDigits.slice(cut)}`;
  const value = Number.parseFloat(normalised);
  const minor = Number.isNaN(value) ? 0 : Math.round(Math.abs(value) * 100);
  return { minor, currency };
}

/**
 * Flatten one product line of a purchase into a row. Delisted products can have
 * a null `productName`; keep the line (we still have skuId/amount) under an
 * "Unknown item" placeholder so spend totals stay correct.
 *
 * Self-contained (references {@link normaliseProductName} and
 * {@link currencySymbol}, also embedded) so it survives `toString()` embedding.
 */
// oxlint-disable-next-line complexity/complexity -- cohesive field assembly with nullish fallbacks; splitting only fragments one literal
export function toPurchaseRow(tx: ApiTransaction, p: ApiProductPurchase): TransactionRow {
  const txDisplay = tx.displayOfTransactionValue ?? "";
  const lineDisplay = p.totalFormatted ?? "";
  return {
    transactionId: tx.id,
    key: p.orderItemId ?? `${tx.id}|${p.skuId ?? p.productName ?? ""}`,
    date: tx.date,
    transactionType: tx.transactionType,
    kind: "purchase",
    productName: p.productName ? normaliseProductName(p.productName) : "Unknown item",
    skuId: p.skuId,
    skuType: p.skuType,
    quantity: p.quantity ?? 1,
    amountMinor: Math.abs(p.total ?? 0),
    currency: currencySymbol(lineDisplay) || currencySymbol(txDisplay),
    displayAmount: lineDisplay || txDisplay,
    originalPriceMinor: p.originalPrice,
    discountMinor: p.discount,
  };
}

/**
 * Flatten one purchase transaction into a row per product line.
 *
 * Self-contained (references {@link toPurchaseRow}, also embedded) so it
 * survives `toString()` embedding.
 */
export function purchaseRows(tx: ApiTransaction): TransactionRow[] {
  const products = tx.purchaseDetails?.productPurchases ?? [];
  return products.map((p) => toPurchaseRow(tx, p));
}

/**
 * Flatten a non-purchase transaction (wallet funding, refund, adjustment, …).
 *
 * Self-contained (references {@link parseDisplayAmount}, also embedded) so it
 * survives `toString()` embedding.
 */
export function nonPurchaseRow(tx: ApiTransaction): TransactionRow {
  const { minor, currency } = parseDisplayAmount(tx.displayOfTransactionValue ?? "");
  return {
    transactionId: tx.id,
    key: tx.id,
    date: tx.date,
    transactionType: tx.transactionType,
    kind: "top-up",
    productName: tx.transactionType,
    quantity: 1,
    amountMinor: minor,
    currency,
    displayAmount: tx.displayOfTransactionValue ?? "",
  };
}

/**
 * Flatten raw GraphQL transaction nodes into per-line rows. Transactions with
 * product purchases yield one purchase row per product; everything else yields a
 * single top-up/other row classified from its transaction type.
 *
 * Self-contained (references {@link purchaseRows} and {@link nonPurchaseRow},
 * also embedded) so it survives `toString()` embedding into the bookmarklet,
 * where it runs over the raw fetched data before the fragment handoff.
 */
export function flattenApiTransactions(transactions: ApiTransaction[]): TransactionRow[] {
  const rows: TransactionRow[] = [];
  for (const tx of transactions) {
    const products = tx.purchaseDetails?.productPurchases ?? [];
    if (products.length > 0) rows.push(...purchaseRows(tx));
    else rows.push(nonPurchaseRow(tx));
  }
  return rows;
}

/** Schema for a persisted, flattened transaction row. */
const transactionRowSchema = Schema.Struct({
  transactionId: Schema.String,
  key: Schema.String,
  date: Schema.String,
  transactionType: Schema.String,
  kind: Schema.Literals(["top-up", "purchase"]),
  productName: Schema.String,
  skuId: Schema.optional(Schema.String),
  skuType: Schema.optional(Schema.String),
  quantity: Schema.Number,
  amountMinor: Schema.Number,
  currency: Schema.String,
  displayAmount: Schema.String,
  originalPriceMinor: Schema.optional(Schema.Number),
  discountMinor: Schema.optional(Schema.Number),
});

const handoffSchema = Schema.Struct({
  v: Schema.Literal(HANDOFF_VERSION),
  accountId: Schema.String,
  source: Schema.String,
  fetchedAt: Schema.String,
  transactions: Schema.mutable(Schema.Array(transactionRowSchema)),
});

const decodeHandoffPayload = Schema.decodeUnknownOption(handoffSchema);

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

/** Validate an untrusted value as a handoff payload, or `null` when invalid. */
export function safeParseHandoff(value: unknown): HandoffPayload | null {
  return Option.getOrNull(decodeHandoffPayload(value));
}

export function decodeHandoff(hash: string): HandoffPayload | null {
  const encoded = readFragment(hash);
  if (encoded === null) return null;
  try {
    return safeParseHandoff(JSON.parse(decodeURIComponent(encoded)));
  } catch {
    return null;
  }
}

/** Schema for the persisted import envelope (shared with the store). */
export const transactionImportSchema = Schema.Struct({
  transactions: Schema.mutable(Schema.Array(transactionRowSchema)),
  importedAt: Schema.String,
  source: Schema.String,
});
