import { describe, expect, it } from "vitest";
import {
  allTransactions,
  freeClaim,
  multiProductPurchase,
  nullNamePurchase,
  preOrderPurchase,
  subscriptionPurchase,
  walletFunding,
} from "@/test/transaction-fixtures";
import {
  type ApiProductPurchase,
  type ApiTransaction,
  currencySymbol,
  decodeHandoff,
  encodeHandoff,
  flattenApiTransactions,
  HANDOFF_VERSION,
  type HandoffPayload,
  nonPurchaseRow,
  normaliseProductName,
  parseDisplayAmount,
  purchaseRows,
  safeParseHandoff,
  toPurchaseRow,
} from "./transactions";

describe(".normaliseProductName", () => {
  it.each([
    [
      "EA SPORTS FC™ 26 Standard Edition PS4 &amp; PS5",
      "EA SPORTS FC™ 26 Standard Edition PS4 & PS5",
    ],
    ["PlayStation®Plus ICONS Pack", "PlayStation®Plus ICONS Pack"],
    ["Marvel&apos;s Spider-Man 2", "Marvel's Spider-Man 2"],
    ["Ratchet &amp; Clank: Rift Apart", "Ratchet & Clank: Rift Apart"],
    ["Quote &quot;name&quot;", 'Quote "name"'],
    ["  spaced   out  title ", "spaced out title"],
  ])("decodes entities and collapses whitespace in %s", (raw, expected) => {
    expect(normaliseProductName(raw)).toBe(expected);
  });
});

describe(".currencySymbol", () => {
  it.each([
    ["£15.99", "£"],
    ["$5.00", "$"],
    ["€10,00", "€"],
    ["US$12.50", "US$"],
    ["GBP 7.99", "GBP"],
    ["", ""],
    ["1599", ""],
  ])("reads %s as %s", (formatted, currency) => {
    expect(currencySymbol(formatted)).toBe(currency);
  });
});

describe(".parseDisplayAmount", () => {
  it.each([
    ["£10.00", 1000, "£"],
    ["-£33.00", 3300, "£"],
    ["£1,234.56", 123456, "£"],
    ["€10,00", 1000, "€"],
    ["£0.00", 0, "£"],
    ["Free", 0, ""],
    // European grouping: "." thousands, "," decimal.
    ["€1.234,56", 123456, "€"],
    ["-€1.234,56", 123456, "€"],
    ["€1.000.000,00", 100000000, "€"],
    ["€1.000", 100000, "€"],
    // English grouping: "," thousands, "." decimal.
    ["£1,234,567.89", 123456789, "£"],
    ["£1,000", 100000, "£"],
  ])("parses %s as %d minor units in %s", (formatted, minor, currency) => {
    expect(parseDisplayAmount(formatted)).toStrictEqual({ minor, currency });
  });
});

describe(".flattenApiTransactions", () => {
  it("emits one row per product line for a multi-product purchase", () => {
    const rows = flattenApiTransactions([multiProductPurchase]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionId: "700000000000001",
      key: "111111111111",
      productName: "Hades",
      skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
      skuType: "STANDARD",
      kind: "purchase",
      amountMinor: 1599,
      currency: "£",
      displayAmount: "£15.99",
    });
    expect(rows[1]).toMatchObject({ productName: "Hades Original Soundtrack", amountMinor: 499 });
  });

  it("carries the pre-order sku type through", () => {
    expect(flattenApiTransactions([preOrderPurchase])[0]).toMatchObject({
      skuType: "PRE_ORDER",
      amountMinor: 3999,
    });
  });

  it("classifies a subscription cycle as a purchase line", () => {
    expect(flattenApiTransactions([subscriptionPurchase])[0]).toMatchObject({
      transactionType: "CYCLE_SUBSCRIPTION",
      skuType: "SUBSCRIPTION",
      kind: "purchase",
      amountMinor: 5999,
    });
  });

  it("retains a free claim with its original price and discount", () => {
    expect(flattenApiTransactions([freeClaim])[0]).toMatchObject({
      amountMinor: 0,
      originalPriceMinor: 4499,
      discountMinor: 4499,
      kind: "purchase",
    });
  });

  it("classifies a non-purchase transaction as a top-up", () => {
    expect(flattenApiTransactions([walletFunding])[0]).toMatchObject({
      transactionId: "700000000000005",
      key: "700000000000005",
      transactionType: "WALLET_FUNDING",
      kind: "top-up",
      amountMinor: 1000,
      currency: "£",
    });
  });

  it("keeps a delisted (null-name) product line under a placeholder", () => {
    expect(flattenApiTransactions([nullNamePurchase])[0]).toMatchObject({
      productName: "Unknown item",
      skuId: "EP1234-PPSA09999_00-DELISTED00000000-E001",
      amountMinor: 799,
      kind: "purchase",
    });
  });

  it("produces a stable per-line key for every row", () => {
    const keys = flattenApiTransactions(allTransactions).map((r) => r.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("emits compact rows carrying only the persisted fields", () => {
    const allowed = new Set([
      "transactionId",
      "key",
      "date",
      "transactionType",
      "kind",
      "productName",
      "skuId",
      "skuType",
      "quantity",
      "amountMinor",
      "currency",
      "displayAmount",
      "originalPriceMinor",
      "discountMinor",
    ]);

    const extras = flattenApiTransactions(allTransactions).flatMap((row) =>
      Object.keys(row).filter((key) => !allowed.has(key))
    );

    expect(extras).toStrictEqual([]);
  });

  it("flattens hundreds of transactions into a fragment-sized payload", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      ...multiProductPurchase,
      id: `tx-${i}`,
    }));

    const rows = flattenApiTransactions(many);
    const encoded = encodeURIComponent(JSON.stringify({ transactions: rows }));

    expect(rows).toHaveLength(600);
    expect(encoded.length).toBeLessThan(1_500_000);
  });
});

describe(".toPurchaseRow", () => {
  it("falls back to the transaction display when the line carries no formatted total", () => {
    const tx: ApiTransaction = {
      id: "t1",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
      displayOfTransactionValue: "£5.00",
    };
    const p: ApiProductPurchase = {
      productName: "Game",
      skuId: "SKU-A",
      total: 500,
      quantity: 1,
      orderItemId: "OI-1",
    };

    expect(toPurchaseRow(tx, p)).toMatchObject({
      key: "OI-1",
      currency: "£",
      displayAmount: "£5.00",
      amountMinor: 500,
    });
  });

  it("builds a fallback key from the sku and defaults quantity and amount when absent", () => {
    const tx: ApiTransaction = {
      id: "t2",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
    };
    const p: ApiProductPurchase = { skuId: "SKU-B", totalFormatted: "£3.00" };

    expect(toPurchaseRow(tx, p)).toMatchObject({
      key: "t2|SKU-B",
      quantity: 1,
      amountMinor: 0,
      currency: "£",
      displayAmount: "£3.00",
      productName: "Unknown item",
    });
  });

  it("keys a line lacking an order id and sku by its product name", () => {
    const tx: ApiTransaction = {
      id: "t3",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
      displayOfTransactionValue: "£1.00",
    };
    const p: ApiProductPurchase = { productName: "Some Game", totalFormatted: "£1.00", total: 100 };

    expect(toPurchaseRow(tx, p)).toMatchObject({ key: "t3|Some Game" });
  });

  it("keys by transaction id with an empty suffix when sku and name are both absent", () => {
    const tx: ApiTransaction = {
      id: "t4",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
      displayOfTransactionValue: "£2.00",
    };
    const p: ApiProductPurchase = { totalFormatted: "£2.00", total: 200 };

    expect(toPurchaseRow(tx, p)).toMatchObject({ key: "t4|", productName: "Unknown item" });
  });
});

describe(".purchaseRows", () => {
  it("returns no rows for a transaction without purchase details", () => {
    const tx: ApiTransaction = {
      id: "p1",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
    };

    expect(purchaseRows(tx)).toStrictEqual([]);
  });
});

describe(".nonPurchaseRow", () => {
  it("defaults the display amount and currency to empty when the transaction has no value", () => {
    const tx: ApiTransaction = {
      id: "n1",
      date: "2024-01-01T00:00:00.000Z",
      transactionType: "WALLET_FUNDING",
    };

    expect(nonPurchaseRow(tx)).toMatchObject({
      key: "n1",
      kind: "top-up",
      productName: "WALLET_FUNDING",
      amountMinor: 0,
      currency: "",
      displayAmount: "",
    });
  });
});

const payload: HandoffPayload = {
  v: HANDOFF_VERSION,
  accountId: "acc-1",
  source: "www.playstation.com",
  fetchedAt: "2024-01-01T00:00:00.000Z",
  transactions: flattenApiTransactions([preOrderPurchase]),
};

describe(".safeParseHandoff", () => {
  it("returns a structurally valid payload", () => {
    expect(safeParseHandoff(payload)).toMatchObject({
      v: HANDOFF_VERSION,
      source: "www.playstation.com",
    });
  });

  it.each([
    [{ ...payload, v: 99 }, "wrong version"],
    [{ ...payload, transactions: "nope" }, "non-array transactions"],
    [{ ...payload, transactions: [{ id: "x" }] }, "malformed transaction"],
    [null, "null"],
    ["string", "non-object"],
  ])("returns null for %o (%s)", (value, _label) => {
    expect(safeParseHandoff(value)).toBeNull();
  });
});

describe(".decodeHandoff", () => {
  it("round-trips a payload encoded into the fragment", () => {
    expect(decodeHandoff(`#${encodeHandoff(payload)}`)?.transactions).toHaveLength(1);
  });

  it("tolerates a fragment without the leading hash", () => {
    expect(decodeHandoff(encodeHandoff(payload))?.source).toBe("www.playstation.com");
  });

  it.each([
    ["", "empty hash"],
    ["#other=1", "wrong key"],
    ["#data=", "missing value"],
    ["#data=not%20json", "non-JSON value"],
  ])("returns null for %s (%s)", (hash) => {
    expect(decodeHandoff(hash)).toBeNull();
  });

  it("returns null when the schema version is wrong", () => {
    const encoded = `data=${encodeURIComponent(JSON.stringify({ ...payload, v: 99 }))}`;
    expect(decodeHandoff(`#${encoded}`)).toBeNull();
  });
});
