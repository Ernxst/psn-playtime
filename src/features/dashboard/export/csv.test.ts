import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/domain/transactions";
import type { GamePlay, ProfileSummary } from "@/server/providers/account/snapshot";
import { buildAccountCsv, buildGamesCsv, buildTransactionsCsv } from "./csv";
import {
  ACCOUNT_CSV_COLUMNS,
  AccountCsvRow,
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

function profile(overrides: Partial<ProfileSummary>): ProfileSummary {
  return {
    onlineId: "Ernxst_",
    accountId: "acc-1",
    isPlus: true,
    trophyLevel: 220,
    levelProgress: 47,
    earned: { platinum: 5, gold: 10, silver: 20, bronze: 40 },
    totalTrophies: 75,
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

function cell(csv: string, column: string, index = 0): string {
  const cells = dataRow(csv, index).split(",");
  return (
    cells[GAMES_CSV_COLUMNS.indexOf(column)] ?? cells[ACCOUNT_CSV_COLUMNS.indexOf(column)] ?? ""
  );
}

const matchingSku = "EP4040-PPSA01234_00-HADES00000000000-E001";

describe(".buildTransactionsCsv", () => {
  it("emits the header row derived from the schema field keys", () => {
    expect(lines(buildTransactionsCsv([]))).toStrictEqual([TRANSACTION_CSV_COLUMNS.join(",")]);
  });

  it("writes one row per transaction with minor units and the ISO date verbatim", () => {
    const csv = buildTransactionsCsv([tx({ skuId: matchingSku, skuType: "STANDARD" })]);

    expect(dataRow(csv)).toBe(
      "700000000000001,line-1,2025-08-29T13:31:23.987Z,PRODUCT_PURCHASE,purchase,Hades,EP4040-PPSA01234_00-HADES00000000000-E001,STANDARD,1,1599,£,£15.99,,"
    );
  });

  it("writes original_price_minor and discount_minor as integers when present", () => {
    const cells = dataRow(
      buildTransactionsCsv([
        tx({ amountMinor: 1000, originalPriceMinor: 4499, discountMinor: 3499 }),
      ])
    ).split(",");

    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("original_price_minor")]).toBe("4499");
    expect(cells[TRANSACTION_CSV_COLUMNS.indexOf("discount_minor")]).toBe("3499");
  });

  it("quotes a product name containing a comma per RFC-4180", () => {
    expect(
      dataRow(buildTransactionsCsv([tx({ productName: "Ratchet & Clank, Rift Apart" })]))
    ).toContain('"Ratchet & Clank, Rift Apart"');
  });
});

describe(".buildGamesCsv", () => {
  it("emits the header row derived from the schema field keys", () => {
    expect(lines(buildGamesCsv([], []))).toStrictEqual([GAMES_CSV_COLUMNS.join(",")]);
  });

  it("writes one game row per title tagged kind=game with its full shape", () => {
    const csv = buildGamesCsv([game({ imageUrl: "https://img", category: "ps5_native_game" })], []);

    expect(cell(csv, "kind")).toBe("game");
    expect(cell(csv, "title_id")).toBe("PPSA01234");
    expect(cell(csv, "name")).toBe("Hades");
    expect(cell(csv, "platform")).toBe("PS5");
    expect(cell(csv, "hours")).toBe("42.5");
    expect(cell(csv, "play_count")).toBe("30");
    expect(cell(csv, "image_url")).toBe("https://img");
    expect(cell(csv, "category")).toBe("ps5_native_game");
  });

  it("flattens the matched game's trophy progress, counts, total and last-earned", () => {
    const csv = buildGamesCsv(
      [
        game({
          trophy: {
            progress: 80,
            earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
            total: 10,
            hasPlatinum: true,
            lastEarnedAt: "2025-01-02",
          },
        }),
      ],
      []
    );

    expect(cell(csv, "trophy_progress")).toBe("80");
    expect(cell(csv, "trophy_earned_platinum")).toBe("1");
    expect(cell(csv, "trophy_total")).toBe("10");
    expect(cell(csv, "trophy_has_platinum")).toBe("true");
    expect(cell(csv, "trophy_last_earned_at")).toBe("2025-01-02");
  });

  it("writes an app as a kind=app row carrying only name and hours", () => {
    const csv = buildGamesCsv([], [{ name: "Netflix", hours: 12 }]);

    expect(cell(csv, "kind")).toBe("app");
    expect(cell(csv, "name")).toBe("Netflix");
    expect(cell(csv, "hours")).toBe("12");
    expect(cell(csv, "title_id")).toBe("");
    expect(cell(csv, "platform")).toBe("");
    expect(cell(csv, "genre")).toBe("");
  });

  it("emits every game followed by every app, one row each", () => {
    const csv = buildGamesCsv(
      [game({}), game({ titleId: "PPSA09999", name: "Celeste" })],
      [{ name: "YouTube", hours: 3 }]
    );

    expect(lines(csv)).toHaveLength(4);
    expect(cell(csv, "kind", 2)).toBe("app");
  });

  it("leaves trophy and other optional game cells blank when absent", () => {
    const csv = buildGamesCsv([game({})], []);

    expect(cell(csv, "trophy_progress")).toBe("");
    expect(cell(csv, "franchise")).toBe("");
    expect(cell(csv, "typical_playtime")).toBe("");
    expect(cell(csv, "image_url")).toBe("");
  });
});

describe(".buildAccountCsv", () => {
  it("emits the header row derived from the schema field keys", () => {
    expect(lines(buildAccountCsv(profile({})))[0]).toBe(ACCOUNT_CSV_COLUMNS.join(","));
  });

  it("writes one row of the non-derivable profile fields", () => {
    const csv = buildAccountCsv(profile({ aboutMe: "hi", avatarUrl: "https://a", isPlus: false }));

    expect(lines(csv)).toHaveLength(2);
    expect(cell(csv, "online_id")).toBe("Ernxst_");
    expect(cell(csv, "account_id")).toBe("acc-1");
    expect(cell(csv, "about_me")).toBe("hi");
    expect(cell(csv, "avatar_url")).toBe("https://a");
    expect(cell(csv, "is_plus")).toBe("false");
    expect(cell(csv, "trophy_level")).toBe("220");
    expect(cell(csv, "level_progress")).toBe("47");
  });

  it("leaves about_me and avatar_url blank when absent", () => {
    const csv = buildAccountCsv(profile({}));

    expect(cell(csv, "about_me")).toBe("");
    expect(cell(csv, "avatar_url")).toBe("");
  });

  it("omits the derivable earned/total and demo fields entirely", () => {
    expect(ACCOUNT_CSV_COLUMNS).not.toContain("earned");
    expect(ACCOUNT_CSV_COLUMNS).not.toContain("total_trophies");
    expect(ACCOUNT_CSV_COLUMNS).not.toContain("is_demo");
    expect(ACCOUNT_CSV_COLUMNS).not.toContain("trophies_unavailable");
  });
});

describe("CSV round-trip through the shared schemas", () => {
  const decodeTransaction = Schema.decodeUnknownSync(TransactionCsvRow);
  const decodeGame = Schema.decodeUnknownSync(GameCsvRow);
  const decodeAccount = Schema.decodeUnknownSync(AccountCsvRow);

  it("reconstructs a games record, keeping the kind, ids and blank optionals", () => {
    const record = recordFrom(GAMES_CSV_COLUMNS, dataRow(buildGamesCsv([game({})], [])));

    const decoded = decodeGame(record);

    expect(decoded.kind).toBe("game");
    expect(decoded.title_id).toBe("PPSA01234");
    expect(decoded.hours).toBe(42.5);
    expect(decoded.trophy_progress).toBeUndefined();
    expect(decoded.franchise).toBeUndefined();
  });

  it("reconstructs an app record with an undefined title id", () => {
    const record = recordFrom(
      GAMES_CSV_COLUMNS,
      dataRow(buildGamesCsv([], [{ name: "Netflix", hours: 12 }]))
    );

    const decoded = decodeGame(record);

    expect(decoded.kind).toBe("app");
    expect(decoded.title_id).toBeUndefined();
    expect(decoded.hours).toBe(12);
  });

  it("reconstructs an account record, decoding blank optionals to undefined", () => {
    const record = recordFrom(ACCOUNT_CSV_COLUMNS, dataRow(buildAccountCsv(profile({}))));

    const decoded = decodeAccount(record);

    expect(decoded.account_id).toBe("acc-1");
    expect(decoded.is_plus).toBe(true);
    expect(decoded.about_me).toBeUndefined();
  });

  it("reconstructs a transaction record with its minor units and ids", () => {
    const record = recordFrom(
      TRANSACTION_CSV_COLUMNS,
      dataRow(buildTransactionsCsv([tx({ skuId: matchingSku, originalPriceMinor: 1999 })]))
    );

    const decoded = decodeTransaction(record);

    expect(decoded.transaction_id).toBe("700000000000001");
    expect(decoded.amount_minor).toBe(1599);
    expect(decoded.original_price_minor).toBe(1999);
  });
});
