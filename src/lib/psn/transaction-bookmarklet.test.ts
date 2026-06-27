import { describe, expect, it } from "vitest";
import {
  bookmarkletHref,
  buildTransactionHistoryUrl,
  dedupeTransactions,
  TRANSACTION_HISTORY_ENDPOINT,
} from "./transaction-bookmarklet";
import { HANDOFF_COMPLETE_TYPE, HANDOFF_MESSAGE_TYPE } from "./transactions";

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

  it("hands off via window.open postMessage and signals completion", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("window.open");
    expect(body).toContain(JSON.stringify(HANDOFF_MESSAGE_TYPE));
    expect(body).toContain(JSON.stringify(HANDOFF_COMPLETE_TYPE));
  });

  it("retains the fragment redirect as the popup-blocked fallback", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("fragmentRedirect");
    expect(body).toContain("#data=");
  });

  it("embeds the prefixed console logging", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("[psn-import]");
  });
});
