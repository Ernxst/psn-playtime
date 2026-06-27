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
 *     transaction id with a safety cap on iterations;
 *  2. hands the raw `transactions[]` nodes to this app's `/import` route.
 *
 * Handoff: the primary mechanism opens `/import` via `window.open`, waits for the
 * receiver's "ready" ping, then `postMessage`s the whole batch (structured
 * clone, no URL-length limit) followed by a "complete" message. If the popup is
 * blocked — or the receiver never readies — it falls back to a same-tab redirect
 * carrying the payload in the URL **fragment** (`#data=...`), which never reaches
 * any server.
 *
 * Flattening/classification stays in the app (`transactions.ts`) so the
 * bookmarklet string stays minimal and node-testable. The persisted-query
 * `sha256Hash` may rotate (`PersistedQueryNotFound`); the bookmarklet surfaces a
 * clear error if Sony changes it.
 */
import {
  HANDOFF_COMPLETE_TYPE,
  HANDOFF_FRAGMENT_KEY,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_VERSION,
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
  const log = (...a) => console.log('[psn-import]', ...a);
  const warn = (...a) => console.warn('[psn-import]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const buildTransactionHistoryUrl = ${buildTransactionHistoryUrl.toString()};
  const dedupeTransactions = ${dedupeTransactions.toString()};

  // 1. Replay the GraphQL request the checkout iframe uses, cookie-authenticated.
  const fetchPage = async (endDate) => {
    const url = buildTransactionHistoryUrl(ENDPOINT, { startDate: START_DATE, endDate, limit: LIMIT }, HASH);
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
    if (json && json.errors && json.errors.length) {
      throw new Error(json.errors.map((e) => (e && (e.message || (e.extensions && e.extensions.code))) || 'error').join('; '));
    }
    if (!res.ok || !json || !json.data || !json.data.transactionHistoryRetrieve) {
      throw new Error('unexpected response (HTTP ' + res.status + ') — are you signed in to PlayStation?');
    }
    return json.data.transactionHistoryRetrieve;
  };

  // Follow the hasMore/nextEndDate cursor, accumulating and de-duping rows.
  const collect = async () => {
    const all = [];
    let endDate = new Date().toISOString();
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchPage(endDate);
      const txs = data.transactions || [];
      for (const t of txs) all.push(t);
      log('page ' + (page + 1) + ': ' + txs.length + ' transactions (running total ' + all.length + ')');
      if (!data.hasMore || !data.nextEndDate) break;
      endDate = data.nextEndDate;
    }
    return dedupeTransactions(all);
  };

  let transactions;
  try {
    transactions = await collect();
  } catch (err) {
    warn('fetch failed: ' + (err && err.message));
    alert('PSN Import failed: ' + (err && err.message ? err.message : 'could not fetch your transactions.') + '\\n\\nMake sure you are signed in to PlayStation and try again.');
    return;
  }
  log('collected ' + transactions.length + ' transactions');
  if (transactions.length === 0) warn('no transactions returned — nothing to import');

  const makePayload = (rows) => ({ v: ${HANDOFF_VERSION}, source: location.host, fetchedAt: new Date().toISOString(), transactions: rows });

  // 2. Hand off. Prefer window.open + postMessage; fall back to a fragment redirect.
  const fragmentRedirect = () => {
    location.href = IMPORT_URL + '#${HANDOFF_FRAGMENT_KEY}=' + encodeURIComponent(JSON.stringify(makePayload(transactions)));
  };

  const w = window.open(IMPORT_URL);
  if (!w) { warn('popup blocked by window.open — falling back to fragment redirect'); fragmentRedirect(); return; }
  log('popup opened — awaiting receiver ready ping (<=15000ms)');

  let ready = false;
  const onMessage = (e) => {
    if (e.origin !== APP_ORIGIN || !e.data) return;
    if (e.data.type === ${JSON.stringify(HANDOFF_READY_TYPE)}) ready = true;
  };
  window.addEventListener('message', onMessage);
  const readyStart = Date.now();
  for (let i = 0; i < 60 && !ready; i++) await sleep(250);
  window.removeEventListener('message', onMessage);
  if (!ready) {
    warn('receiver ready ping NOT received within ' + (Date.now() - readyStart) + 'ms — falling back to fragment redirect');
    fragmentRedirect();
    return;
  }
  log('receiver ready after ' + (Date.now() - readyStart) + 'ms — posting ' + transactions.length + ' transactions');

  try {
    w.postMessage({ type: ${JSON.stringify(HANDOFF_MESSAGE_TYPE)}, payload: makePayload(transactions) }, APP_ORIGIN);
    w.postMessage({ type: ${JSON.stringify(HANDOFF_COMPLETE_TYPE)} }, APP_ORIGIN);
    log('handoff complete');
  } catch (err) {
    warn('postMessage failed: ' + (err && err.message) + ' — falling back to fragment redirect');
    fragmentRedirect();
  }
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
