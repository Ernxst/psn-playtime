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
 * Keep this file dependency-light (zod only) so both the route and the store can
 * import it cheaply.
 */
import { z } from "zod";

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
export const HANDOFF_VERSION = 3;

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
  /** Host the transactions were fetched from. */
  source: string;
  /** ISO timestamp the transactions were fetched. */
  fetchedAt: string;
  /** Already-flattened rows (flattening runs on the bookmarklet side). */
  transactions: TransactionRow[];
}

/** The handful of HTML entities PlayStation emits in product names. */
export const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

/**
 * Normalise a product name. PlayStation leaves HTML entities in some titles
 * (e.g. `EA SPORTS FC™ 26 Standard Edition PS4 &amp; PS5`); decode the handful it
 * emits and collapse whitespace. Trademark glyphs (`™ ®`) are preserved.
 *
 * Self-contained (only references {@link HTML_ENTITIES}, also embedded) so it
 * survives `toString()` embedding into the bookmarklet.
 */
export function normaliseProductName(raw: string): string {
  return raw
    .replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export const CURRENCY = /US\$|[£$€]|[A-Z]{3}/;

/** Currency symbol/code from a formatted amount, or "" when none is present. */
export function currencySymbol(formatted: string): string {
  const match = CURRENCY.exec(formatted);
  return match ? match[0] : "";
}

/** Parse a formatted amount like "£10.00" into absolute minor units + currency. */
export function parseDisplayAmount(formatted: string): { minor: number; currency: string } {
  const currency = currencySymbol(formatted);
  const digits = formatted.replace(/[^\d.,-]/g, "");
  const normalised = digits.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
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
const transactionRowSchema = z.object({
  transactionId: z.string(),
  key: z.string(),
  date: z.string(),
  transactionType: z.string(),
  kind: z.enum(["top-up", "purchase"]),
  productName: z.string(),
  skuId: z.string().optional(),
  skuType: z.string().optional(),
  quantity: z.number(),
  amountMinor: z.number(),
  currency: z.string(),
  displayAmount: z.string(),
  originalPriceMinor: z.number().optional(),
  discountMinor: z.number().optional(),
});

const handoffSchema = z.object({
  v: z.literal(HANDOFF_VERSION),
  source: z.string(),
  fetchedAt: z.string(),
  transactions: z.array(transactionRowSchema),
});

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
  const parsed = handoffSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
export const transactionImportSchema = z.object({
  transactions: z.array(transactionRowSchema),
  importedAt: z.string(),
  source: z.string(),
});
