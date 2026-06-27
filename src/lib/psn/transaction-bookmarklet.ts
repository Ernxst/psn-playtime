/**
 * Builds the one-click transaction-history bookmarklet.
 *
 * The bookmarklet runs on a signed-in `playstation.com` page (where the user's
 * `np` cookies are in scope) and replays the same GraphQL request the checkout
 * iframe uses, `transactionHistoryRetrieve`, directly. The Order History list
 * itself lives in a cross-origin `checkout.playstation.com` iframe a bookmarklet
 * can never read, so we call the JSON API instead of scraping the DOM. When
 * clicked it:
 *  1. fetches the transaction history page-by-page (cookie-authenticated),
 *     following the `hasMore`/`nextEndDate` cursor until exhausted, de-duping by
 *     transaction id, tolerating partial GraphQL errors (a delisted product can
 *     null `productName` and trip the persisted query's strict schema — we use
 *     the data when it is present and only hard-fail when a page has none);
 *  2. flattens the raw nodes into compact {@link TransactionRow}s on this side
 *     (dropping cover art and other unused fields to keep the payload small);
 *  3. opens `/import` with the compact rows in the opened tab's own URL
 *     **fragment** (`#data=...`). The receiver reads its own hash — no
 *     cross-window messaging, so it survives the app's
 *     `Cross-Origin-Opener-Policy: same-origin`. If the popup is blocked it
 *     falls back to a same-tab redirect carrying the same fragment.
 *
 * The flatten helpers live in `transactions.ts` (node-tested) and are embedded
 * here via `toString()` so the bookmarklet stays a single self-contained string.
 */
import {
  currencySymbol,
  flattenApiTransactions,
  HANDOFF_FRAGMENT_KEY,
  HANDOFF_VERSION,
  nonPurchaseRow,
  normaliseProductName,
  parseDisplayAmount,
  purchaseRows,
  toPurchaseRow,
} from "./transactions";

/** The GraphQL endpoint the checkout app calls for transaction history. */
export const TRANSACTION_HISTORY_ENDPOINT = "https://web.np.playstation.com/api/graphql/v1//op";

/** Persisted-query hash for `transactionHistoryRetrieve` (may rotate). */
const TRANSACTION_HISTORY_HASH = "f04fe7c7d8498bee5cd0615400eceb07d77eab097d118475ac9fa0c8446b3a42";

/** GraphQL `variables` for one transaction-history page. */
export interface TransactionHistoryQuery {
  startDate: string;
  endDate: string;
  limit: number;
}

/**
 * Build the `transactionHistoryRetrieve` request URL (operation name, variables
 * and persisted-query extensions, all URL-encoded).
 *
 * Self-contained (no other module references) so it survives being embedded into
 * the bookmarklet via `toString()`, and unit-testable in node.
 */
export function buildTransactionHistoryUrl(
  endpoint: string,
  query: TransactionHistoryQuery,
  sha256Hash: string
): string {
  const variables = encodeURIComponent(JSON.stringify(query));
  const extensions = encodeURIComponent(
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash } })
  );
  return `${endpoint}?operationName=transactionHistoryRetrieve&variables=${variables}&extensions=${extensions}`;
}

/**
 * De-dupe transactions by `id`, preserving first-seen order. The cursor can
 * re-emit a row when several transactions share the `nextEndDate` boundary.
 *
 * Self-contained so it survives `toString()` embedding, and unit-testable.
 */
export function dedupeTransactions<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/** The IIFE body, parameterised by the app's origin and import URL. */
// oxlint-disable-next-line eslint/max-lines-per-function -- a single self-contained bookmarklet IIFE string; splitting it would only fragment one literal
function source(appOrigin: string, importUrl: string): string {
  return `(async () => {
  const APP_ORIGIN = ${JSON.stringify(appOrigin)};
  const IMPORT_URL = ${JSON.stringify(importUrl)};
  const ENDPOINT = ${JSON.stringify(TRANSACTION_HISTORY_ENDPOINT)};
  const HASH = ${JSON.stringify(TRANSACTION_HISTORY_HASH)};
  const LIMIT = 100;
  const START_DATE = '1994-01-01T00:00:00.000Z';
  const MAX_PAGES = 200;
  const MAX_FRAGMENT = 1500000;
  const log = (...a) => console.log('[psn-import]', ...a);
  const warn = (...a) => console.warn('[psn-import]', ...a);
  const ${buildTransactionHistoryUrl.name} = ${buildTransactionHistoryUrl.toString()};
  const ${dedupeTransactions.name} = ${dedupeTransactions.toString()};
  // Flatten helpers, embedded from transactions.ts so the bookmarklet matches
  // the app's parser exactly. Defined in dependency order.
  //
  // Each helper is declared under its *runtime* \`.name\`, not a hard-coded
  // identifier. The app bundle minifies these functions, so \`fn.toString()\`
  // captures bodies whose helper-to-helper calls use the minified binding names;
  // \`fn.name\` is that same minified name, so the \`const\` we declare matches the
  // call sites and nothing references an undefined identifier. (Unminified, in
  // dev and tests, \`.name\` is just the original name.) The helpers carry no
  // free module-scope references of their own — only browser globals.
  const ${normaliseProductName.name} = ${normaliseProductName.toString()};
  const ${currencySymbol.name} = ${currencySymbol.toString()};
  const ${parseDisplayAmount.name} = ${parseDisplayAmount.toString()};
  const ${toPurchaseRow.name} = ${toPurchaseRow.toString()};
  const ${purchaseRows.name} = ${purchaseRows.toString()};
  const ${nonPurchaseRow.name} = ${nonPurchaseRow.toString()};
  const ${flattenApiTransactions.name} = ${flattenApiTransactions.toString()};

  // 1. Replay the GraphQL request the checkout iframe uses, cookie-authenticated.
  //    Returns the data node when usable (even if the response also has errors,
  //    e.g. a strict-schema null productName); throws only when no data.
  const fetchPage = async (endDate) => {
    const url = ${buildTransactionHistoryUrl.name}(ENDPOINT, { startDate: START_DATE, endDate, limit: LIMIT }, HASH);
    const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'apollographql-client-name': '@sie-ppr-web-checkout/app',
        'apollographql-client-version': '2.175.0',
        'x-psn-storefront-type': 'checkout:pdc',
        'x-psn-app-ver': '@sie-ppr-web-checkout/app/v2.175.0',
        'x-psn-request-id': requestId,
      },
    });
    const json = await res.json().catch(() => null);
    const data = json && json.data && json.data.transactionHistoryRetrieve;
    const errs = json && json.errors && json.errors.length
      ? json.errors.map((e) => (e && (e.message || (e.extensions && e.extensions.code))) || 'error').join('; ')
      : '';
    if (data && data.transactions) {
      if (errs) warn('page returned errors but usable data — continuing: ' + errs);
      return data;
    }
    throw new Error(errs || ('unexpected response (HTTP ' + res.status + ') — are you signed in to PlayStation?'));
  };

  // Follow the hasMore/nextEndDate cursor, accumulating and de-duping rows.
  // A page failure aborts only when nothing has been collected yet (first-page
  // auth error / PersistedQueryNotFound); otherwise we keep what we have.
  const collect = async () => {
    const all = [];
    let endDate = new Date().toISOString();
    for (let page = 0; page < MAX_PAGES; page++) {
      let data;
      try { data = await fetchPage(endDate); }
      catch (err) {
        if (all.length === 0) throw err;
        warn('page ' + (page + 1) + ' failed — stopping with ' + all.length + ' collected: ' + (err && err.message));
        break;
      }
      const txs = data.transactions || [];
      for (const t of txs) all.push(t);
      log('page ' + (page + 1) + ': ' + txs.length + ' transactions (running total ' + all.length + ')');
      if (!data.hasMore || !data.nextEndDate) break;
      endDate = data.nextEndDate;
    }
    return ${dedupeTransactions.name}(all);
  };

  let rows;
  try {
    const transactions = await collect();
    rows = ${flattenApiTransactions.name}(transactions);
  } catch (err) {
    warn('fetch failed: ' + (err && err.message));
    alert('PSN Import failed: ' + (err && err.message ? err.message : 'could not fetch your transactions.') + '\\n\\nMake sure you are signed in to PlayStation and try again.');
    return;
  }
  log('flattened ' + rows.length + ' rows');
  if (rows.length === 0) warn('no transactions returned — nothing to import');

  // 2. Hand off via the opened tab's own URL fragment (#data=...). Same-origin
  //    COOP severs window.opener, so we never message — the receiver reads its
  //    own hash. Fall back to a same-tab redirect when the popup is blocked.
  const payload = { v: ${HANDOFF_VERSION}, source: location.host, fetchedAt: new Date().toISOString(), transactions: rows };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  log('payload: ' + rows.length + ' rows, ' + encoded.length + ' encoded bytes');
  if (encoded.length > MAX_FRAGMENT) warn('payload exceeds ~1.5MB encoded — the fragment handoff may be truncated by the browser');
  const target = IMPORT_URL + '#${HANDOFF_FRAGMENT_KEY}=' + encoded;
  const w = window.open(target);
  if (!w) { warn('popup blocked by window.open — same-tab redirect to ' + APP_ORIGIN); location.href = target; }
  else log('handoff opened at ' + APP_ORIGIN + '/import');
})();`;
}

/**
 * The full `javascript:` bookmarklet URI for the given app origin.
 * `appOrigin` is e.g. `https://psn.example.dev` (no trailing slash needed).
 */
export function bookmarkletHref(appOrigin: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  return `javascript:${encodeURIComponent(source(origin, `${origin}/import`))}`;
}
