/**
 * Builds the one-click transaction-history bookmarklet.
 *
 * The bookmarklet runs on the user's own already-authenticated PlayStation
 * order/transaction-history page (same-origin with the data). When clicked it:
 *  1. navigates to the Order History screen if not already there (clicking the
 *     profile toggler then the Order History menu item);
 *  2. scrolls to the bottom in a loop until the loading spinner is gone and no
 *     new `.transaction-history-card` rows appear;
 *  3. scrapes each row's raw date/amount/description text (with the card's rich
 *     `aria-label` as a fallback); then
 *  4. hands the rows to this app's `/import` route.
 *
 * Handoff: the primary mechanism is `window.open` + `postMessage` (no URL-length
 * limit, so it scales to complete histories). A small handshake waits for the
 * receiver's "ready" ping, posts the payload, and retries until acknowledged.
 * If the popup is blocked — or the handshake times out — it falls back to a
 * same-tab redirect carrying the payload in the URL **fragment** (`#data=...`),
 * which never reaches any server.
 *
 * Parsing/classification stays in the app (`transactions.ts`) so the bookmarklet
 * string stays minimal and node-testable. The DOM selectors mirror Sony's order
 * page and will break if Sony restructures it; the heuristics are forgiving.
 */
import {
  HANDOFF_FRAGMENT_KEY,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_RECEIVED_TYPE,
  HANDOFF_VERSION,
} from "./transactions";

/** The IIFE body, parameterised by the app's origin and import URL. */
// oxlint-disable-next-line eslint/max-lines-per-function -- a single self-contained bookmarklet IIFE string; splitting it would only fragment one literal
function source(appOrigin: string, importUrl: string): string {
  return `(async () => {
  const APP_ORIGIN = ${JSON.stringify(appOrigin)};
  const IMPORT_URL = ${JSON.stringify(importUrl)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
  const visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
  };
  const onHistory = () => !!document.querySelector('.transaction-history-screen');
  const manual = () => alert('PSN Import: open your profile menu and click Order History, then run the bookmark again.');

  // 1. Navigate to Order History if we aren't already on it.
  if (!onHistory()) {
    const toggler = document.querySelector('button[data-qa="web-toolbar#profile-container#profile-icon#dropdown-toggler"]');
    if (toggler) {
      toggler.click();
      await sleep(600);
      const item = document.querySelector('button[data-qa="web-toolbar#profile-container#profile-dropdown#item-list#order-history#button"]')
        || document.querySelector('button[data-track-click="web:select-order-history-menu-item"]');
      if (item) { item.click(); } else { manual(); }
    } else {
      manual();
    }
    for (let i = 0; i < 30 && !onHistory(); i++) await sleep(300);
  }

  // 2. Scroll to the bottom until everything is loaded: stop once the spinner is
  //    gone AND no new cards appeared on the last pass.
  const SEL = '.transaction-history-card';
  const spinning = () => visible(document.querySelector('.transaction-history__loading-spinner'))
    || visible(document.querySelector('[data-testid="loading-circle"]'))
    || visible(document.querySelector('.processing-payment__loading-circle'));
  let stable = 0;
  for (let i = 0; i < 600 && stable < 2; i++) {
    const before = document.querySelectorAll(SEL).length;
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(500);
    for (let j = 0; j < 40 && spinning(); j++) await sleep(400);
    const after = document.querySelectorAll(SEL).length;
    stable = (after === before && !spinning()) ? stable + 1 : 0;
  }

  // 3. Scrape each card. Per-card element ids are duplicated/invalid, so query by
  //    class/structure within each card. The rich aria-label is a fallback.
  const AMOUNT = /-?\\s*(?:[£$€]|US\\$)\\s?\\d[\\d,]*(?:\\.\\d{1,2})?/;
  const DATE = /\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\b/;
  const rows = [...document.querySelectorAll(SEL)].map((card) => {
    let description = text(card.querySelector('.transaction-history-card-content-description .transaction-history-card-details-field'));
    let date = '';
    const details = card.querySelector('.transaction-history-card-content-details');
    if (details) {
      const fields = [...details.querySelectorAll('.transaction-history-card-details-field')].map(text);
      date = (fields.join(' ').match(DATE) || [''])[0];
    }
    let amount = '';
    const amountLabel = card.querySelector('.transaction-history-card-details-amount-label');
    if (amountLabel) {
      const group = amountLabel.closest('.transaction-history-card-details-amount') || amountLabel.parentElement;
      const field = group ? group.querySelector('.transaction-history-card-details-field') : null;
      amount = text(field) || (text(group).match(AMOUNT) || [''])[0];
    }
    const btn = card.querySelector('button[aria-label]');
    const label = btn ? (btn.getAttribute('aria-label') || '') : '';
    if (!description && label) description = (label.split(', transaction made on')[0] || '').trim();
    if (!date && label) date = (label.match(DATE) || [''])[0];
    if (!amount && label) amount = (label.match(AMOUNT) || [''])[0];
    return { date: date.trim(), amount: amount.trim(), description: description.trim() };
  });

  // 4. Hand off. Prefer window.open + postMessage; fall back to a fragment redirect.
  const payload = { v: ${HANDOFF_VERSION}, source: location.host, scrapedAt: new Date().toISOString(), rows };
  const fragmentRedirect = () => {
    location.href = IMPORT_URL + '#${HANDOFF_FRAGMENT_KEY}=' + encodeURIComponent(JSON.stringify(payload));
  };
  const w = window.open(IMPORT_URL);
  if (!w) { fragmentRedirect(); return; }
  let ready = false, acked = false;
  const onMessage = (e) => {
    if (e.origin !== APP_ORIGIN || !e.data) return;
    if (e.data.type === ${JSON.stringify(HANDOFF_READY_TYPE)}) ready = true;
    if (e.data.type === ${JSON.stringify(HANDOFF_RECEIVED_TYPE)}) acked = true;
  };
  window.addEventListener('message', onMessage);
  const message = { type: ${JSON.stringify(HANDOFF_MESSAGE_TYPE)}, payload };
  for (let i = 0; i < 60 && !acked; i++) {
    if (ready) { try { w.postMessage(message, APP_ORIGIN); } catch (err) {} }
    await sleep(250);
  }
  window.removeEventListener('message', onMessage);
  if (!acked) fragmentRedirect();
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
