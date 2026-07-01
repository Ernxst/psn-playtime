import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/domain/transactions";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { buildGamesCsv, buildTransactionsCsv } from "./csv";
import {
  GAMES_CSV_COLUMNS,
  GameCsvRow,
  TRANSACTION_CSV_COLUMNS,
  TransactionCsvRow,
} from "./csv-schema.effect";

function tx(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    transactionId: "700000000000001",
    key: "line-1",
    date: "2025-08-29T13:31:23.987Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Hades",
    quantity: 1,
    amountMinor: 1599,
    currency: "£",
    displayAmount: "£15.99",
    ...overrides,
  };
}

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: "PPSA01234",
    name: "Hades",
    platform: "PS5",
    hours: 42.5,
    playCount: 30,
    genre: "Action-Adventure",
    isApp: false,
    ...overrides,
  };
}

/** Split a CSV document into its lines (records are CRLF-separated). */
function lines(csv: string): string[] {
  return csv.split("\r\n");
}

/** The nth data record (past the header row), or "" when absent. */
function dataRow(csv: string, index = 0): string {
  return lines(csv).slice(1)[index] ?? "";
}

/** Zip a split CSV record's cells back onto their header keys. */
function recordFrom(columns: readonly string[], row: string): Record<string, string> {
  const cells = row.split(",");
  return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""]));
}

const matchingSku = "EP4040-PPSA01234_00-HADES00000000000-E001";

describe(".buildTransactionsCsv", () => {
  it("emits the header row derived from the schema field keys", () => {
    const csv = buildTransactionsCsv([]);

    expect(lines(csv)).toStrictEqual([TRANSACTION_CSV_COLUMNS.join(",")]);
  });

  it("writes one row per transaction with minor units and the ISO date verbatim", () => {
    const csv = buildTransactionsCsv([tx({ skuId: matchingSku, skuType: "STANDARD" })]);

    expect(dataRow(csv)).toBe(
      "700000000000001,line-1,2025-08-29T13:31:23.987Z,PRODUCT_PURCHASE,purchase,Hades,EP4040-PPSA01234_00-HADES00000000000-E001,STANDARD,1,1599,£,£15.99,,"
    );
  });

  it("carries every imported kind, including top-ups", () => {
    const csv = buildTransactionsCsv([
      tx({ kind: "top-up", transactionType: "WALLET_FUNDING", productName: "WALLET_FUNDING" }),
    ]);

    expect(lines(csv)).toHaveLength(2);
  });

  it("leaves original_price_minor and discount_minor blank when absent", () => {
    const cells = dataRow(buildTransactionsCsv([tx({})])).split(",");

    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("original_price_minor")]).toBe("");
    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("discount_minor")]).toBe("");
  });

  it("writes original_price_minor and discount_minor as integers when present", () => {
    const csv = buildTransactionsCsv([
      tx({ amountMinor: 1000, originalPriceMinor: 4499, discountMinor: 3499 }),
    ]);
    const cells = dataRow(csv).split(",");

    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("original_price_minor")]).toBe("4499");
    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("discount_minor")]).toBe("3499");
  });

  it.each([
    ["a comma", "Ratchet & Clank, Rift Apart", '"Ratchet & Clank, Rift Apart"'],
    ["a quote", 'The "Best" Game', '"The ""Best"" Game"'],
    ["a newline", "Line one\nline two", '"Line one\nline two"'],
  ])("quotes a product name containing %s per RFC-4180", (_label, productName, expected) => {
    const csv = buildTransactionsCsv([tx({ productName })]);

    expect(dataRow(csv)).toContain(expected);
  });
});

describe(".buildGamesCsv", () => {
  const library = [game({})];

  it("emits the header row derived from the schema field keys", () => {
    const csv = buildGamesCsv([], library);

    expect(lines(csv)).toStrictEqual([GAMES_CSV_COLUMNS.join(",")]);
  });

  it("enriches a matched transaction with the joined game's fields", () => {
    const csv = buildGamesCsv([tx({ skuId: matchingSku })], library);
    const cells = dataRow(csv).split(",");

    expect(cells[GAMES_CSV_COLUMNS.indexOf("title_id")]).toBe("PPSA01234");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("game_name")]).toBe("Hades");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("hours")]).toBe("42.5");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("play_count")]).toBe("30");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("amount_minor")]).toBe("1599");
  });

  it("writes the matched game's trophy progress and earned counts", () => {
    const withTrophy = [
      game({
        trophy: {
          progress: 80,
          earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
          total: 40,
          hasPlatinum: true,
        },
      }),
    ];

    const cells = dataRow(buildGamesCsv([tx({ skuId: matchingSku })], withTrophy)).split(",");

    expect(cells[GAMES_CSV_COLUMNS.indexOf("trophy_progress")]).toBe("80");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("trophy_earned_platinum")]).toBe("1");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("trophy_has_platinum")]).toBe("true");
  });

  it("leaves trophy and other optional game cells blank when absent", () => {
    const cells = dataRow(buildGamesCsv([tx({ skuId: matchingSku })], library)).split(",");

    expect(cells[GAMES_CSV_COLUMNS.indexOf("trophy_progress")]).toBe("");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("franchise")]).toBe("");
    expect(cells[GAMES_CSV_COLUMNS.indexOf("typical_playtime")]).toBe("");
  });

  it("omits a transaction that matched no library game", () => {
    const csv = buildGamesCsv(
      [tx({ productName: "Some Unowned Game", skuId: undefined })],
      library
    );

    expect(lines(csv)).toHaveLength(1);
  });

  it("writes a base game and its add-on as separate rows carrying the same game", () => {
    const csv = buildGamesCsv(
      [
        tx({ key: "base", skuId: matchingSku }),
        tx({
          key: "dlc",
          productName: "Hades Original Soundtrack",
          skuId: "EP4040-PPSA01234_00-HADESOST00000000-E001",
          skuType: "ADD_ON",
          amountMinor: 499,
        }),
      ],
      library
    );
    const rows = lines(csv).slice(1);
    const titleIds = rows.map((row) => row.split(",")[GAMES_CSV_COLUMNS.indexOf("title_id")]);

    expect(titleIds).toStrictEqual(["PPSA01234", "PPSA01234"]);
  });
});

describe("CSV round-trip", () => {
  const decodeTransaction = Schema.decodeUnknownSync(TransactionCsvRow);
  const decodeGame = Schema.decodeUnknownSync(GameCsvRow);

  it("reconstructs a transaction record from its encoded CSV row for the future importer", () => {
    const row = tx({
      skuId: matchingSku,
      skuType: "STANDARD",
      originalPriceMinor: 1999,
      discountMinor: 400,
    });
    const record = recordFrom(TRANSACTION_CSV_COLUMNS, dataRow(buildTransactionsCsv([row])));

    expect(decodeTransaction(record)).toStrictEqual({
      transaction_id: "700000000000001",
      key: "line-1",
      date: "2025-08-29T13:31:23.987Z",
      transaction_type: "PRODUCT_PURCHASE",
      kind: "purchase",
      product_name: "Hades",
      sku_id: matchingSku,
      sku_type: "STANDARD",
      quantity: 1,
      amount_minor: 1599,
      currency: "£",
      display_amount: "£15.99",
      original_price_minor: 1999,
      discount_minor: 400,
    });
  });

  it("decodes blank optional cells back to undefined", () => {
    const record = recordFrom(TRANSACTION_CSV_COLUMNS, dataRow(buildTransactionsCsv([tx({})])));

    const decoded = decodeTransaction(record);

    expect(decoded.original_price_minor).toBeUndefined();
    expect(decoded.sku_id).toBeUndefined();
  });

  it("reconstructs a games record, keeping minor units and blank optionals", () => {
    const csv = buildGamesCsv([tx({ skuId: matchingSku })], [game({})]);
    const record = recordFrom(GAMES_CSV_COLUMNS, dataRow(csv));

    const decoded = decodeGame(record);

    expect(decoded.title_id).toBe("PPSA01234");
    expect(decoded.amount_minor).toBe(1599);
    expect(decoded.hours).toBe(42.5);
    expect(decoded.trophy_progress).toBeUndefined();
    expect(decoded.franchise).toBeUndefined();
  });
});
