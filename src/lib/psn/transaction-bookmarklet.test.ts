import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
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

/**
 * Generate the bookmarklet from a *minified* build of this module, exactly as
 * the shipped app does. The app bundle (rolldown/esbuild) renames the embedded
 * helpers' module bindings, so `fn.toString()` captures bodies that reference
 * those minified names; the bookmarklet must declare each helper under a
 * matching name (and carry no free module-scope data references) or it throws a
 * `ReferenceError` at runtime. An unminified `bookmarkletBody()` can never catch
 * that — only re-minifying the source can.
 */
async function minifiedBookmarkletBody(origin: string): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL("./transaction-bookmarklet.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    platform: "node",
  });
  // Import the minified bundle as a real module (zod is bundled in, so a self
  // contained `data:` URL needs no resolution and bypasses Vite's transform) and
  // generate from it, so `bookmarkletHref` embeds the renamed helper bindings.
  const [output] = outputFiles ?? [];
  const url = `data:text/javascript;base64,${Buffer.from(output?.text ?? "").toString("base64")}`;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- dynamic import of a freshly built artifact; its type is external to the project
  const mod: { bookmarkletHref(o: string): string } = await import(url);

  return decodeURIComponent(mod.bookmarkletHref(origin).replace(/^javascript:/, ""));
}

/**
 * Run the embedded flatten chain lifted out of a generated bookmarklet body
 * against `transactions`. The helper `const`s are declared under their minified
 * names, so the last-declared one (`flattenApiTransactions`) is invoked by the
 * name it was actually given.
 */
function runEmbeddedFlatten(body: string, transactions: unknown[]): unknown {
  const helpers = body.slice(body.indexOf("// Flatten helpers"), body.indexOf("// 1. Replay"));
  const names = [...helpers.matchAll(/const (\w+) =/g)].map((m) => m[1]);
  const flattenName = names.at(-1);
  const script = `(() => { ${helpers}\nreturn ${flattenName}(${JSON.stringify(transactions)}); })()`;
  const rows: unknown = vm.runInNewContext(script);

  return rows;
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

  it("flattens transactions when the embedded helpers are minified by the app build", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");
    const purchase = {
      id: "txn-1",
      date: "2024-05-01T00:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
      purchaseDetails: {
        productPurchases: [
          {
            productName: "EA SPORTS FC™ 26 Standard Edition PS4 &amp; PS5",
            skuId: "SKU-1",
            skuType: "STANDARD",
            quantity: 1,
            total: 6999,
            totalFormatted: "£69.99",
          },
        ],
      },
    };

    // `runEmbeddedFlatten` builds rows in a separate vm realm, so assert with
    // `toEqual` (cross-realm prototypes differ; the values are what matter).
    const rows = runEmbeddedFlatten(body, [purchase]);

    expect(rows).toEqual([
      {
        transactionId: "txn-1",
        key: "txn-1|SKU-1",
        date: "2024-05-01T00:00:00.000Z",
        transactionType: "PRODUCT_PURCHASE",
        kind: "purchase",
        productName: "EA SPORTS FC™ 26 Standard Edition PS4 & PS5",
        skuId: "SKU-1",
        skuType: "STANDARD",
        quantity: 1,
        amountMinor: 6999,
        currency: "£",
        displayAmount: "£69.99",
      },
    ]);
  });
});
