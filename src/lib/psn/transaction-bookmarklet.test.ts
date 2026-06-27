import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  bookmarkletHref,
  buildTransactionHistoryUrl,
  dedupeTransactions,
  TRANSACTION_HISTORY_ENDPOINT,
} from "./transaction-bookmarklet";

function bookmarkletBody(origin: string): string {
  return decodeURIComponent(bookmarkletHref(origin).replace(/^javascript:/, ""));
}

describe(".buildTransactionHistoryUrl", () => {
  const url = buildTransactionHistoryUrl(
    TRANSACTION_HISTORY_ENDPOINT,
    { startDate: "1994-01-01T00:00:00.000Z", endDate: "2025-07-17T20:20:44.944Z", limit: 100 },
    "abc123"
  );

  it("targets the operation name", () => {
    expect(url).toContain("operationName=transactionHistoryRetrieve");
  });

  it("URL-encodes the variables including the endDate cursor", () => {
    const variables = new URL(url).searchParams.get("variables");

    expect(JSON.parse(variables ?? "")).toEqual({
      startDate: "1994-01-01T00:00:00.000Z",
      endDate: "2025-07-17T20:20:44.944Z",
      limit: 100,
    });
  });

  it("URL-encodes the persisted-query hash in the extensions", () => {
    const extensions = new URL(url).searchParams.get("extensions");

    expect(JSON.parse(extensions ?? "")).toEqual({
      persistedQuery: { version: 1, sha256Hash: "abc123" },
    });
  });
});

describe(".dedupeTransactions", () => {
  it("drops repeated ids and keeps first-seen order", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];

    expect(dedupeTransactions(rows)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("returns an empty list unchanged", () => {
    expect(dedupeTransactions([])).toEqual([]);
  });
});

describe(".bookmarkletHref", () => {
  it("produces a javascript: URI that fetches the transaction-history API", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("fetch(");
    expect(body).toContain("transactionHistoryRetrieve");
    expect(body).toContain("buildTransactionHistoryUrl");
    expect(body).toContain("nextEndDate");
  });

  it("embeds the app's flatten helpers so rows are compacted before handoff", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("flattenApiTransactions");
    expect(body).toContain("toPurchaseRow");
    expect(body).toContain("nonPurchaseRow");
  });

  it("hands off the compact rows via the opened tab's own URL fragment", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("window.open");
    expect(body).toContain("#data=");
    expect(body).toContain("location.href");
  });

  it("does not stream via postMessage (COOP severs the opener)", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).not.toContain("postMessage");
  });

  it("embeds the prefixed console logging", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("[psn-import]");
  });

  it("produces a syntactically valid script body once helpers are embedded", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    // Compile-only (vm.Script parses without running): guards that the
    // toString()-embedded helpers concatenate into valid JS.
    expect(() => new vm.Script(body)).not.toThrow();
  });
});
