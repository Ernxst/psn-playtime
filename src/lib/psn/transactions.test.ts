import { describe, expect, it } from "vitest";
import {
  classifyKind,
  decodeHandoff,
  encodeHandoff,
  HANDOFF_VERSION,
  type HandoffPayload,
  normaliseDescription,
  parseAmount,
  parseTransactions,
  type RawTransactionRow,
  toISODate,
} from "./transactions";

describe(".parseAmount", () => {
  it.each([
    ["£33.00", 33, "£"],
    ["-£10.00", 10, "£"],
    ["£1,234.56", 1234.56, "£"],
    ["$5", 5, "$"],
    ["US$12.50", 12.5, "US$"],
    ["€10,00", 10, "€"],
    ["GBP 7.99", 7.99, "GBP"],
  ])("parses %s as %d in %s", (raw, value, currency) => {
    expect(parseAmount(raw)).toEqual({ value, currency });
  });

  it.each([["Free"], [""], ["—"], ["no digits here"]])("returns null for %s", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe(".classifyKind", () => {
  it.each([
    ["PlayStation Store Wallet", "top-up"],
    ["Add funds to wallet", "top-up"],
    ["Funds added", "top-up"],
    ["£10 Top-up", "top-up"],
    ["PSN Card redemption", "top-up"],
    ["Gift card", "top-up"],
    ["Voucher code", "top-up"],
    ["Cyberpunk 2077", "purchase"],
    ["EA SPORTS FC 24 Standard Edition", "purchase"],
  ] as const)("classifies %s as %s", (description, kind) => {
    expect(classifyKind(description)).toBe(kind);
  });
});

describe(".normaliseDescription", () => {
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
    expect(normaliseDescription(raw)).toBe(expected);
  });
});

describe(".toISODate", () => {
  it.each([
    ["2023-05-12", "2023-05-12"],
    ["2023-05-12T09:30:00Z", "2023-05-12"],
    ["12 May 2023", "2023-05-12"],
    ["May 12, 2023", "2023-05-12"],
    ["12/05/2023", "2023-05-12"],
  ])("normalises %s to %s", (raw, iso) => {
    expect(toISODate(raw)).toBe(iso);
  });

  it("returns the trimmed original when unparseable", () => {
    expect(toISODate("  not a date  ")).toBe("not a date");
  });
});

describe(".parseTransactions", () => {
  const rows: RawTransactionRow[] = [
    { date: "12 May 2023", amount: "-£33.00", description: "Satisfactory" },
    { date: "01/01/2024", amount: "£10.00", description: "PlayStation Store Wallet" },
    { date: "bad", amount: "Free", description: "Demo download" },
    { date: "03 Jun 2022", amount: "£59.99", description: "EA SPORTS FC™ 24" },
  ];

  it("drops rows without a parseable amount", () => {
    expect(parseTransactions(rows)).toHaveLength(3);
  });

  it("parses amount, date and currency for a purchase", () => {
    expect(parseTransactions(rows)[0]).toEqual({
      date: "2023-05-12",
      description: "Satisfactory",
      amount: 33,
      currency: "£",
      kind: "purchase",
    });
  });

  it("classifies a wallet row as a top-up", () => {
    expect(parseTransactions(rows)[1]).toMatchObject({ kind: "top-up", amount: 10 });
  });

  it("strips trademark glyphs only via the description passthrough", () => {
    expect(parseTransactions(rows)[2]).toMatchObject({
      description: "EA SPORTS FC™ 24",
      amount: 59.99,
      kind: "purchase",
    });
  });

  it("parses real-world PlayStation order rows", () => {
    const real: RawTransactionRow[] = [
      {
        date: "03/11/2025",
        amount: "£59.99",
        description: "EA SPORTS FC™ 26 Standard Edition PS4 &amp; PS5",
      },
      { date: "21/09/2024", amount: "£0.00", description: "PlayStation®Plus ICONS Pack" },
      { date: "07/02/2023", amount: "£10.00", description: "PlayStation Store Wallet top-up" },
    ];

    expect(parseTransactions(real)).toEqual([
      {
        date: "2025-11-03",
        description: "EA SPORTS FC™ 26 Standard Edition PS4 & PS5",
        amount: 59.99,
        currency: "£",
        kind: "purchase",
      },
      {
        date: "2023-02-07",
        description: "PlayStation Store Wallet top-up",
        amount: 10,
        currency: "£",
        kind: "top-up",
      },
    ]);
  });
});

describe(".decodeHandoff", () => {
  const payload: HandoffPayload = {
    v: HANDOFF_VERSION,
    source: "store.playstation.com",
    scrapedAt: "2024-01-01T00:00:00.000Z",
    rows: [{ date: "12 May 2023", amount: "-£33.00", description: "Satisfactory" }],
  };

  it("round-trips a payload encoded into the fragment", () => {
    expect(decodeHandoff(`#${encodeHandoff(payload)}`)).toEqual(payload);
  });

  it("tolerates a fragment without the leading hash", () => {
    expect(decodeHandoff(encodeHandoff(payload))).toEqual(payload);
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
