/**
 * Transaction-history domain: parsing the rows the bookmarklet replays from the
 * PlayStation `transactionHistoryRetrieve` GraphQL API, and the one-click
 * handoff payload the bookmarklet hands to the app.
 *
 * PSN has no public spend API, so the data is replayed client-side by a
 * bookmarklet (see `transaction-bookmarklet.ts`) running on a logged-in
 * `playstation.com` page (cookie-authenticated). The bookmarklet posts the raw
 * GraphQL `transactions[]` nodes; all flattening/classification/validation lives
 * here so it is testable in node and the bookmarklet string stays minimal.
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
export const HANDOFF_VERSION = 2;

/**
 * Origin the bookmarklet runs on (a signed-in PlayStation page). The `/import`
 * receiver only accepts a `postMessage` handoff from exactly this origin.
 */
export const PLAYSTATION_ORIGIN = "https://www.playstation.com";

/** `postMessage` envelope type carrying a handoff payload. */
export const HANDOFF_MESSAGE_TYPE = "psn-transactions";

/** `postMessage` envelope the receiver sends back once it is ready to receive. */
export const HANDOFF_READY_TYPE = "psn-import-ready";

/** `postMessage` envelope the receiver sends back once it has persisted a payload. */
export const HANDOFF_RECEIVED_TYPE = "psn-import-received";

/** `postMessage` envelope the opener sends once every batch has been streamed. */
export const HANDOFF_COMPLETE_TYPE = "psn-transactions-complete";

/** A single raw `productPurchases[]` entry from the GraphQL response. */
const apiProductPurchaseSchema = z.object({
  productName: z.string(),
  skuId: z.string().optional(),
  skuType: z.string().optional(),
  quantity: z.number().optional(),
  total: z.number().optional(),
  totalFormatted: z.string().optional(),
  originalPrice: z.number().optional(),
  discount: z.number().optional(),
  orderItemId: z.string().optional(),
});

/**
 * A single raw `transactions[]` node from `transactionHistoryRetrieve`. Unknown
 * keys (cover art, charge details, `__typename`, …) are stripped by zod; only
 * the fields the app uses are validated.
 */
const apiTransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  transactionType: z.string(),
  invoiceType: z.string().optional(),
  displayOfTransactionValue: z.string().optional(),
  purchaseDetails: z
    .object({ productPurchases: z.array(apiProductPurchaseSchema) })
    .nullable()
    .optional(),
});

export type ApiTransaction = z.infer<typeof apiTransactionSchema>;

/** The payload the bookmarklet hands to `/import` (postMessage or fragment). */
export interface HandoffPayload {
  v: typeof HANDOFF_VERSION;
  /** Host the transactions were fetched from. */
  source: string;
  /** ISO timestamp the transactions were fetched. */
  fetchedAt: string;
  transactions: ApiTransaction[];
}

const handoffSchema = z.object({
  v: z.literal(HANDOFF_VERSION),
  source: z.string(),
  fetchedAt: z.string(),
  transactions: z.array(apiTransactionSchema),
});

/** The handful of HTML entities PlayStation emits in product names. */
const HTML_ENTITIES: Record<string, string> = {
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
 */
export function normaliseProductName(raw: string): string {
  return raw
    .replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

const CURRENCY = /US\$|[£$€]|[A-Z]{3}/;

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

type ApiProductPurchase = z.infer<typeof apiProductPurchaseSchema>;

/** Flatten one product line of a purchase into a row. */
// oxlint-disable-next-line complexity/complexity -- cohesive field assembly with nullish fallbacks; splitting only fragments one literal
function toPurchaseRow(tx: ApiTransaction, p: ApiProductPurchase): TransactionRow {
  const txDisplay = tx.displayOfTransactionValue ?? "";
  const lineDisplay = p.totalFormatted ?? "";
  return {
    transactionId: tx.id,
    key: p.orderItemId ?? `${tx.id}|${p.skuId ?? p.productName}`,
    date: tx.date,
    transactionType: tx.transactionType,
    kind: "purchase",
    productName: normaliseProductName(p.productName),
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

/** Flatten one purchase transaction into a row per product line. */
function purchaseRows(tx: ApiTransaction): TransactionRow[] {
  const products = tx.purchaseDetails?.productPurchases ?? [];
  return products.map((p) => toPurchaseRow(tx, p));
}

/** Flatten a non-purchase transaction (wallet funding, refund, adjustment, …). */
function nonPurchaseRow(tx: ApiTransaction): TransactionRow {
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

/**
 * Validate an untrusted value as a handoff payload. Used for the `postMessage`
 * handoff, where the data arrives as a structured-clone object rather than a
 * fragment string; the shape is validated exactly as the fragment path.
 */
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

/** Schema for the persisted import envelope (shared with the store). */
export const transactionImportSchema = z.object({
  transactions: z.array(transactionRowSchema),
  importedAt: z.string(),
  source: z.string(),
});
