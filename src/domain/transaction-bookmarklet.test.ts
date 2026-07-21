import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as Schema from "effect/Schema";
import { build } from "esbuild";
import { HttpResponse, http } from "msw";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import * as Transactions from "@/test/factories/transactions";
import { server } from "@/test/msw";
import {
  AUTHENTICATED_ACCOUNT_ENDPOINT,
  bookmarkletHref,
  buildTransactionHistoryUrl,
  dedupeTransactions,
  importErrorMessage,
  mountImportOverlay,
  TRANSACTION_HISTORY_ENDPOINT,
  type TransactionHistoryQuery,
} from "./transaction-bookmarklet";

function bookmarkletBody(origin: string): string {
  return decodeURIComponent(
    bookmarkletHref(origin, "acc-1", "Ernxst_").replace(/^javascript:/, "")
  );
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
  const [output] = outputFiles;
  if (!output) throw new Error("esbuild produced no bookmarklet output");
  const url = `data:text/javascript;base64,${Buffer.from(output.text).toString("base64")}`;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- dynamic import of a freshly built artifact; its type is external to the project
  const mod: { bookmarkletHref(o: string, accountId: string, onlineId: string): string } =
    await import(url);

  return decodeURIComponent(
    mod.bookmarkletHref(origin, "acc-1", "Ernxst_").replace(/^javascript:/, "")
  );
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

async function runBookmarklet(
  identity: { ok: boolean; status: number; body: unknown },
  options: { minified?: boolean } = {}
) {
  const body = options.minified
    ? await minifiedBookmarkletBody("https://psn.example.dev")
    : bookmarkletBody("https://psn.example.dev");
  const { document, created } = fakeDocument();
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("/user/details")) {
      return {
        ok: identity.ok,
        status: identity.status,
        json: () => Promise.resolve(identity.body),
      };
    }
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            transactionHistoryRetrieve: {
              transactions: [],
              hasMore: false,
            },
          },
        }),
    };
  });
  const open = vi.fn(() => ({}));
  const postMessage = vi.fn();
  const log = vi.fn();
  const warn = vi.fn();
  const crypto = { randomUUID: () => "request-id" };

  await vm.runInNewContext(body, {
    document,
    fetch,
    window: { crypto, open, postMessage },
    crypto,
    location: { host: "www.playstation.com" },
    console: { log, warn },
    setTimeout,
  });

  return {
    fetch,
    log,
    open,
    postMessage,
    warn,
    message: created.find((element) => element.attrs["aria-live"] === "polite"),
  };
}

/**
 * Mount the overlay from a *minified* bookmarklet body in a `vm` realm with a
 * document stub. Slicing the embedded `// Progress overlay` region and running it
 * proves the helper survives the app's minifier: a misnamed binding would throw
 * `ReferenceError: <minified-name> is not defined` here, exactly as it would on
 * the PSN page. Returns the live controller plus the `aria-live` message node.
 */
function runEmbeddedOverlay(body: string): { overlay: OverlayController; message: FakeElement } {
  const region = body.slice(body.indexOf("// Progress overlay"), body.indexOf("// 1. Verify"));
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
  textUpdates: string[];
  children: DirectElement[];
  removed: boolean;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: DirectElement) => DirectElement;
  remove: () => void;
}

function directElement(): DirectElement {
  let textContent: string | undefined;
  const element: DirectElement = {
    style: {},
    attrs: {},
    textUpdates: [],
    children: [],
    removed: false,
    setAttribute(name, value) {
      element.attrs[name] = value;
    },
    appendChild(child) {
      // oxlint-disable-next-line test-contract/no-dom-selector -- mutates the fake DOM model; it does not traverse rendered DOM
      element.children.push(child);

      return child;
    },
    remove() {
      element.removed = true;
    },
  };
  Object.defineProperty(element, "textContent", {
    get: () => textContent,
    set: (value: string | undefined) => {
      textContent = value;
      if (value !== undefined) element.textUpdates.push(value);
    },
    enumerable: true,
  });

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

async function runNetworkBookmarklet(): Promise<{
  href: string;
  message: DirectElement;
  open: ReturnType<typeof vi.fn>;
}> {
  server.use(
    http.get(AUTHENTICATED_ACCOUNT_ENDPOINT, () => HttpResponse.json({ handle: "Ernxst_" }))
  );
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  onTestFinished(() => void vi.useRealTimers());
  const body = bookmarkletBody("https://psn.example.dev");
  const dom = directDocument();
  const location = { host: "store.playstation.com", href: "https://store.playstation.com/" };
  const open = vi.fn(() => null);
  const crypto = { randomUUID: () => "request-id" };
  const context = {
    document: dom.document,
    fetch: globalThis.fetch,
    location,
    window: { crypto, open },
    crypto,
    console: { log: vi.fn(), warn: vi.fn() },
    setTimeout: globalThis.setTimeout,
  };

  await vm.runInNewContext(body, context);
  vi.advanceTimersByTime(1500);

  const message =
    dom.created.find((element) => element.attrs["aria-live"] === "polite") ??
    (() => {
      throw new Error("bookmarklet did not create an aria-live message node");
    })();
  return { href: location.href, message, open };
}

function importedPayload(href: string): unknown {
  const encoded = new URL(href).hash.replace(/^#data=/, "");
  return JSON.parse(decodeURIComponent(encoded)) as unknown;
}

const TransactionHistoryQuerySchema = Schema.Struct({
  startDate: Schema.String,
  endDate: Schema.String,
  limit: Schema.Number,
});

function transactionQuery(request: Request): TransactionHistoryQuery {
  const raw: unknown = JSON.parse(new URL(request.url).searchParams.get("variables") ?? "{}");
  return Schema.decodeUnknownSync(TransactionHistoryQuerySchema)(raw);
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

    expect(JSON.parse(variables ?? "")).toStrictEqual({
      startDate: "1994-01-01T00:00:00.000Z",
      endDate: "2025-07-17T20:20:44.944Z",
      limit: 100,
    });
  });

  it("URL-encodes the persisted-query hash in the extensions", () => {
    const extensions = new URL(url).searchParams.get("extensions");

    expect(JSON.parse(extensions ?? "")).toStrictEqual({
      persistedQuery: { version: 1, sha256Hash: "abc123" },
    });
  });
});

describe(".dedupeTransactions", () => {
  it("drops repeated ids and keeps first-seen order", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];

    expect(dedupeTransactions(rows)).toStrictEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("returns an empty list unchanged", () => {
    expect(dedupeTransactions([])).toStrictEqual([]);
  });
});

describe(".bookmarkletHref", () => {
  it("rejects a mismatched PlayStation session before fetching or handing off transactions", async () => {
    const { fetch, open, message } = await runBookmarklet({
      ok: true,
      status: 200,
      body: { handle: "OtherPlayer" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(message?.textContent).toContain(
      "this bookmarklet belongs to Ernxst_, but PlayStation is signed in as OtherPlayer"
    );
    expect(message?.textContent).toContain("if your Online ID changed");
  });

  it.each([
    [{ ok: false, status: 401, body: { message: "User is not authorized!" } }, "not signed in"],
    [{ ok: true, status: 200, body: {} }, "not signed in"],
  ])(
    "rejects an unverifiable PlayStation session before transaction fetch",
    async (identity, text) => {
      const { fetch, open, message } = await runBookmarklet(identity);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
      expect(message?.textContent).toContain(text);
    }
  );

  it("fetches transactions and stamps the bound account only after an exact identity match", async () => {
    const { fetch, open } = await runBookmarklet({
      ok: true,
      status: 200,
      body: { handle: "Ernxst_" },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/#data=.*%22accountId%22%3A%22acc-1%22.*%22transactions%22%3A%5B%5D/)
    );
  });

  it("hands off without postMessage when the generated bookmarklet is minified", async () => {
    const { open, postMessage } = await runBookmarklet(
      { ok: true, status: 200, body: { handle: "Ernxst_" } },
      { minified: true }
    );

    expect(open).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("prefixes generated bookmarklet console output after minification", async () => {
    const { log, warn } = await runBookmarklet(
      { ok: true, status: 200, body: { handle: "Ernxst_" } },
      { minified: true }
    );

    expect(log).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenNthCalledWith(
      1,
      "[psn-import]",
      "page 1: 0 transactions (running total 0)"
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[psn-import]",
      "no transactions returned — nothing to import"
    );
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

    expect(JSON.parse(JSON.stringify(rows))).toStrictEqual([
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

    expect(JSON.parse(JSON.stringify(rows))).toStrictEqual([
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

describe("bookmarklet transaction-history workflow", () => {
  it("executes the authenticated GraphQL request through successful pagination", async () => {
    const cursor = "2024-01-01T00:00:00.000Z";
    server.use(
      http.get(TRANSACTION_HISTORY_ENDPOINT, ({ request }) => {
        const url = new URL(request.url);
        const variables = transactionQuery(request);
        const valid =
          url.searchParams.get("operationName") === "transactionHistoryRetrieve" &&
          variables.limit === 100 &&
          variables.startDate === "1994-01-01T00:00:00.000Z" &&
          request.credentials === "include" &&
          request.headers.get("apollographql-client-name") === "@sie-ppr-web-checkout/app" &&
          request.headers.get("x-psn-storefront-type") === "checkout:pdc" &&
          request.headers.get("x-psn-request-id") === "request-id";
        return HttpResponse.json(
          valid
            ? variables.endDate === cursor
              ? Transactions.historyResponse([
                  Transactions.multiProductPurchase(),
                  Transactions.walletFunding(),
                ])
              : Transactions.historyResponse([Transactions.multiProductPurchase()], {
                  hasMore: true,
                  nextEndDate: cursor,
                })
            : { errors: [{ message: "invalid request" }] }
        );
      })
    );

    const result = await runNetworkBookmarklet();

    expect(result.message.textUpdates).toStrictEqual([
      "Fetching your transactions… Keep this tab open.",
      "Fetching transactions… 1 collected (page 1). Keep this tab open.",
      "Fetching transactions… 3 collected (page 2). Keep this tab open.",
      "Done — opening Playtime…",
    ]);
    expect(result.open).toHaveBeenCalledTimes(1);
    expect(importedPayload(result.href)).toMatchObject({
      v: 4,
      source: "store.playstation.com",
      transactions: [
        { transactionId: Transactions.multiProductPurchase().id, key: "111111111111" },
        { transactionId: Transactions.multiProductPurchase().id, key: "111111111112" },
        { transactionId: Transactions.walletFunding().id, kind: "top-up" },
      ],
    });
  });

  it("continues with usable transaction data when GraphQL also returns errors", async () => {
    server.use(
      http.get(TRANSACTION_HISTORY_ENDPOINT, () =>
        HttpResponse.json(
          Transactions.historyResponse([Transactions.nullNamePurchase()], {
            errors: [{ message: "productName was null" }],
          })
        )
      )
    );

    const result = await runNetworkBookmarklet();

    expect(result.open).toHaveBeenCalledTimes(1);
    expect(importedPayload(result.href)).toMatchObject({
      transactions: [{ transactionId: Transactions.nullNamePurchase().id }],
    });
  });

  it("leaves the first-page failure visible and does not hand off an import", async () => {
    server.use(
      http.get(TRANSACTION_HISTORY_ENDPOINT, () =>
        HttpResponse.json({ errors: [{ message: "PersistedQueryNotFound" }] })
      )
    );

    const result = await runNetworkBookmarklet();

    expect(result.open).not.toHaveBeenCalled();
    expect(result.href).toBe("https://store.playstation.com/");
    expect(result.message.textContent).toBe("Import failed: PersistedQueryNotFound");
  });

  it("hands off the collected rows when a later page fails", async () => {
    const cursor = "2024-01-01T00:00:00.000Z";
    server.use(
      http.get(TRANSACTION_HISTORY_ENDPOINT, ({ request }) => {
        const variables = transactionQuery(request);
        return HttpResponse.json(
          variables.endDate === cursor
            ? { errors: [{ message: "later page unavailable" }] }
            : Transactions.historyResponse([Transactions.walletFunding()], {
                hasMore: true,
                nextEndDate: cursor,
              })
        );
      })
    );

    const result = await runNetworkBookmarklet();

    expect(result.open).toHaveBeenCalledTimes(1);
    expect(importedPayload(result.href)).toMatchObject({
      transactions: [{ transactionId: Transactions.walletFunding().id, kind: "top-up" }],
    });
  });
});

describe(".mountImportOverlay", () => {
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

    expect(message.textContent).toBe(
      "PlayStation is rate-limiting requests. Wait a minute, then run the bookmarklet again."
    );
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

    // oxlint-disable-next-line test-contract/no-dom-selector -- asserts the fake document fallback selected by appendChild
    expect(dom.documentElement.children).toContain(dom.created[0]);
  });
});
