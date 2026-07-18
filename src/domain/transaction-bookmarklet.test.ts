import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import {
  bookmarkletHref,
  buildTransactionHistoryUrl,
  dedupeTransactions,
  importErrorMessage,
  mountImportOverlay,
  TRANSACTION_HISTORY_ENDPOINT,
} from "./transaction-bookmarklet";

function bookmarkletBody(origin: string): string {
  return decodeURIComponent(bookmarkletHref(origin, "acc-1").replace(/^javascript:/, ""));
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
  // Import the minified bundle as a real module (deps are bundled in, so a self
  // contained `data:` URL needs no resolution and bypasses Vite's transform) and
  // generate from it, so `bookmarkletHref` embeds the renamed helper bindings.
  const [output] = outputFiles ?? [];
  const url = `data:text/javascript;base64,${Buffer.from(output?.text ?? "").toString("base64")}`;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- dynamic import of a freshly built artifact; its type is external to the project
  const mod: { bookmarkletHref(o: string, accountId: string): string } = await import(url);

  return decodeURIComponent(mod.bookmarkletHref(origin, "acc-1").replace(/^javascript:/, ""));
}

/**
 * Run the embedded flatten chain lifted out of a generated bookmarklet body
 * against `transactions`. The helper `const`s are declared under their minified
 * names, so the last-declared one (`flattenApiTransactions`) is invoked by the
 * name it was actually given.
 */
function runEmbeddedFlatten(body: string, transactions: unknown[]): unknown {
  const helpers = body.slice(
    body.indexOf("// Flatten helpers"),
    body.indexOf("// Progress overlay")
  );
  const names = [...helpers.matchAll(/const (\w+) =/g)].map((m) => m[1]);
  const flattenName = names.at(-1);
  const script = `(() => { ${helpers}\nreturn ${flattenName}(${JSON.stringify(transactions)}); })()`;
  const rows: unknown = vm.runInNewContext(script);

  return rows;
}

interface FakeElement {
  style: Record<string, string>;
  attrs: Record<string, string>;
  id?: string;
  textContent?: string;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: FakeElement) => FakeElement;
  remove: () => void;
}

interface OverlayController {
  progress: (collected: number, page: number) => void;
  done: () => void;
  error: (message: string) => void;
  remove: () => void;
}

/** A document stub just rich enough to mount the overlay in a node `vm` realm. */
function fakeDocument(): { document: unknown; created: FakeElement[] } {
  const created: FakeElement[] = [];
  const makeElement = (): FakeElement => {
    const attrs: Record<string, string> = {};
    const element: FakeElement = {
      style: {},
      attrs,
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
      appendChild: (child) => child,
      remove: () => {},
    };

    return element;
  };
  const body = makeElement();
  const document = {
    getElementById: () => null,
    createElement: () => {
      const element = makeElement();
      created.push(element);

      return element;
    },
    body,
    documentElement: body,
  };

  return { document, created };
}

/**
 * Mount the overlay from a *minified* bookmarklet body in a `vm` realm with a
 * document stub. Slicing the embedded `// Progress overlay` region and running it
 * proves the helper survives the app's minifier: a misnamed binding would throw
 * `ReferenceError: <minified-name> is not defined` here, exactly as it would on
 * the PSN page. Returns the live controller plus the `aria-live` message node.
 */
function runEmbeddedOverlay(body: string): { overlay: OverlayController; message: FakeElement } {
  const region = body.slice(body.indexOf("// Progress overlay"), body.indexOf("// 1. Replay"));
  const { document, created } = fakeDocument();
  const script = `(() => { ${region}\nreturn overlay; })()`;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- vm output from a freshly built artifact run in a child realm; its type is external to the project
  const overlay = vm.runInNewContext(script, { document }) as OverlayController;
  const message = created.find((element) => element.attrs["aria-live"] === "polite");
  if (!message) throw new Error("overlay did not create an aria-live message node");

  return { overlay, message };
}

/** A live DOM element stub for invoking the real `mountImportOverlay` in node. */
interface DirectElement {
  style: Record<string, string>;
  attrs: Record<string, string>;
  id?: string;
  textContent?: string;
  children: DirectElement[];
  removed: boolean;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: DirectElement) => DirectElement;
  remove: () => void;
}

function directElement(): DirectElement {
  const element: DirectElement = {
    style: {},
    attrs: {},
    children: [],
    removed: false,
    setAttribute(name, value) {
      element.attrs[name] = value;
    },
    appendChild(child) {
      element.children.push(child);

      return child;
    },
    remove() {
      element.removed = true;
    },
  };

  return element;
}

/**
 * A `document` stub rich enough to mount the overlay by calling the real
 * `mountImportOverlay` directly (so the source is instrumented). `body: null`
 * exercises the `document.body || document.documentElement` fallback, which a
 * real browser never hits.
 */
function directDocument(options: { existing?: DirectElement; body?: DirectElement | null } = {}): {
  document: unknown;
  created: DirectElement[];
  documentElement: DirectElement;
} {
  const created: DirectElement[] = [];
  const documentElement = directElement();
  const body = options.body === undefined ? directElement() : options.body;
  const document = {
    getElementById: () => options.existing ?? null,
    createElement: () => {
      const element = directElement();
      created.push(element);

      return element;
    },
    body,
    documentElement,
  };

  return { document, created, documentElement };
}

describe(".importErrorMessage", () => {
  it.each([
    ["unexpected response (HTTP 401) — are you signed in to PlayStation?", "not signed in"],
    ["your session has expired", "not signed in"],
    ["unexpected response (HTTP 429) — are you signed in to PlayStation?", "rate-limiting"],
    ["unexpected response (HTTP 403) — are you signed in to PlayStation?", "blocked the request"],
    ["Failed to fetch", "Network error"],
    ["PersistedQueryNotFound", "Import failed: PersistedQueryNotFound"],
  ])("maps %j to an actionable message containing %j", (raw, expected) => {
    expect(importErrorMessage(raw)).toContain(expected);
  });

  it("falls back to echoing an empty message safely", () => {
    expect(importErrorMessage("")).toBe("Import failed: ");
  });
});

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

  it("binds the handoff to the account that generated the bookmarklet", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain('const ACCOUNT_ID = "acc-1"');
    expect(body).toContain("accountId: ACCOUNT_ID");
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

  it("parses European-formatted top-ups via the minified embedded parser", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");
    const topUp = {
      id: "txn-eu",
      date: "2024-06-01T00:00:00.000Z",
      transactionType: "WALLET_FUNDED",
      displayOfTransactionValue: "€1.234,56",
    };

    const rows = runEmbeddedFlatten(body, [topUp]);

    expect(rows).toEqual([
      {
        transactionId: "txn-eu",
        key: "txn-eu",
        date: "2024-06-01T00:00:00.000Z",
        transactionType: "WALLET_FUNDED",
        kind: "top-up",
        productName: "WALLET_FUNDED",
        quantity: 1,
        amountMinor: 123456,
        currency: "€",
        displayAmount: "€1.234,56",
      },
    ]);
  });
});

describe(".mountImportOverlay", () => {
  it("embeds the overlay helpers, mounts them, and wires progress/done/error", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("mountImportOverlay");
    expect(body).toContain("importErrorMessage");
    expect(body).toContain("aria-live");
    expect(body).toContain("overlay.progress(");
    expect(body).toContain("overlay.done()");
    expect(body).toContain("overlay.error(");
  });

  it("mounts the overlay from the minified bookmarklet body without a ReferenceError", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");

    const { message } = runEmbeddedOverlay(body);

    expect(message.textContent).toBe("Fetching your transactions… Keep this tab open.");
  });

  it("updates the live progress line as pages are collected via the minified body", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");
    const { overlay, message } = runEmbeddedOverlay(body);

    overlay.progress(150, 2);

    expect(message.textContent).toBe(
      "Fetching transactions… 150 collected (page 2). Keep this tab open."
    );
  });

  it("shows the success state before handoff via the minified body", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");
    const { overlay, message } = runEmbeddedOverlay(body);

    overlay.done();

    expect(message.textContent).toBe("Done — opening Playtime…");
  });

  it("categorises errors through the minified embedded importErrorMessage", async () => {
    const body = await minifiedBookmarkletBody("https://psn.example.dev");
    const { overlay, message } = runEmbeddedOverlay(body);

    overlay.error("unexpected response (HTTP 429) — are you signed in to PlayStation?");

    expect(message.textContent).toContain("rate-limiting");
  });

  it("mounts a live overlay wired to the host DOM and updates through its lifecycle", () => {
    const dom = directDocument();
    vi.stubGlobal("document", dom.document);

    const overlay = mountImportOverlay();
    const message = dom.created.find((element) => element.attrs["aria-live"] === "polite");

    expect(message?.textContent).toBe("Fetching your transactions… Keep this tab open.");

    overlay.progress(150, 2);
    expect(message?.textContent).toBe(
      "Fetching transactions… 150 collected (page 2). Keep this tab open."
    );

    overlay.done();
    expect(message?.textContent).toBe("Done — opening Playtime…");

    overlay.error("unexpected response (HTTP 429) — are you signed in to PlayStation?");
    expect(message?.textContent).toContain("rate-limiting");

    overlay.remove();
    expect(dom.created[0]?.removed).toBe(true);
  });

  it("removes a previously mounted overlay before mounting a new one", () => {
    const previous = directElement();
    const dom = directDocument({ existing: previous });
    vi.stubGlobal("document", dom.document);

    mountImportOverlay();

    expect(previous.removed).toBe(true);
  });

  it("falls back to the document element when the page has no body", () => {
    const dom = directDocument({ body: null });
    vi.stubGlobal("document", dom.document);

    mountImportOverlay();

    expect(dom.documentElement.children).toContain(dom.created[0]);
  });
});
