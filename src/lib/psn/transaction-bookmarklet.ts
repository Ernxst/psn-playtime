/**
 * Builds the one-click transaction-history bookmarklet.
 *
 * The bookmarklet runs on the user's own already-authenticated PlayStation
 * order/transaction-history page (same-origin with the data). When clicked it:
 *  1. navigates to the Order History screen if not already there (clicking the
 *     profile toggler then the Order History menu item);
 *  2. loads every transaction by scrolling to the bottom in a loop until the
 *     `.transaction-history-card` row count stops growing (the list lazy-loads
 *     on scroll; the spinner only shows while a batch is loading, so we must
 *     scroll → wait → repeat rather than stop the moment the spinner is absent);
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

/**
 * Walks up from `start` and returns the first ancestor that is actually
 * scrollable: `overflow-y` of `auto`/`scroll` and real overflow
 * (`scrollHeight > clientHeight`). Returns `null` when none qualifies.
 *
 * Self-contained (no other module references) so it survives being embedded
 * into the bookmarklet via `toString()`, and unit-testable against a real DOM.
 */
export function findScrollableAncestor(start: Element | null): HTMLElement | null {
  let node = start ? start.parentElement : null;
  while (node) {
    const canScroll = /^(?:auto|scroll)$/.test(getComputedStyle(node).overflowY);
    if (canScroll && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Resolves the element that actually scrolls the Order History list.
 *
 * The list lives in a JS side panel whose scroll container is an *outer*
 * wrapper (`.transaction-history-workstream-wrapper`, or its inner
 * `.transaction-history-workstream`), NOT an ancestor of
 * `.transaction-history-screen-cards` — walking up from the cards container
 * returns nothing on the real DOM. The wrapper only becomes scrollable once
 * enough rows exist, so the real-overflow check (`scrollHeight > clientHeight`)
 * is re-evaluated every call and the loop must re-resolve each iteration.
 * Falls back to walking up from the cards container.
 *
 * Self-contained (only references `findScrollableAncestor`, also embedded) so it
 * survives `toString()` embedding, and unit-testable against a real DOM.
 */
export function resolveScrollContainer(root: ParentNode): HTMLElement | null {
  const selectors = [".transaction-history-workstream-wrapper", ".transaction-history-workstream"];
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight) return el;
  }
  return findScrollableAncestor(root.querySelector(".transaction-history-screen-cards"));
}

/**
 * The "stop loading" decision for the lazy-load scroll loop: the row count has
 * been stable for at least two passes and no batch is currently loading.
 *
 * Extracted (and embedded into the bookmarklet via `toString()`) so the
 * termination condition can be unit-tested in isolation.
 */
export function countStabilised(stableRounds: number, spinnerVisible: boolean): boolean {
  return stableRounds >= 2 && !spinnerVisible;
}

/** The IIFE body, parameterised by the app's origin and import URL. */
// oxlint-disable-next-line eslint/max-lines-per-function -- a single self-contained bookmarklet IIFE string; splitting it would only fragment one literal
function source(appOrigin: string, importUrl: string): string {
  return `(async () => {
  const APP_ORIGIN = ${JSON.stringify(appOrigin)};
  const IMPORT_URL = ${JSON.stringify(importUrl)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
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

  // 2. Load every transaction. The list lazy-loads on scroll: the spinner only
  //    shows while a batch is loading (and stays in the DOM hidden between
  //    batches), so we scroll → wait → repeat until the row count stops growing
  //    rather than stopping the instant the spinner is absent.
  const SEL = '.transaction-history-card';
  const spinnerEl = () => document.querySelector('.transaction-history__loading-spinner')
    || document.querySelector('[data-testid="loading-circle"]');
  const spinnerVisible = () => {
    const s = spinnerEl();
    return !!s && (s.offsetParent !== null || s.getClientRects().length > 0);
  };
  const findScrollableAncestor = ${findScrollableAncestor.toString()};
  const resolveScrollContainer = ${resolveScrollContainer.toString()};
  const countStabilised = ${countStabilised.toString()};
  const scrollToBottom = () => {
    // Re-resolve every pass: the wrapper mounts/becomes scrollable only after
    // the panel has loaded enough rows, so a once-cached element goes stale.
    const scroller = resolveScrollContainer(document);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    // Belt-and-braces: scroll the last card into view, which scrolls whatever
    // ancestor is actually scrollable even when none was resolved above.
    const cards = document.querySelectorAll(SEL);
    const lastCard = cards[cards.length - 1];
    if (lastCard && lastCard.scrollIntoView) lastCard.scrollIntoView({ block: 'end' });
    const se = document.scrollingElement || document.documentElement;
    if (se) se.scrollTop = se.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  };
  const settle = async () => {
    for (let i = 0; i < 8 && !spinnerVisible(); i++) await sleep(150);
    for (let i = 0; i < 40 && spinnerVisible(); i++) await sleep(300);
  };
  let last = -1, stable = 0;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const count = document.querySelectorAll(SEL).length;
    if (count === last) {
      stable++;
      if (countStabilised(stable, spinnerVisible())) break;
    } else { stable = 0; last = count; }
    scrollToBottom();
    await settle();
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
