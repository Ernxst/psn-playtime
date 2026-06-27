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
 *  4. streams the rows to this app's `/import` route, a batch at a time.
 *
 * Handoff: the primary mechanism opens `/import` once via `window.open`, waits
 * for the receiver's "ready" ping, then `postMessage`s each freshly lazy-loaded
 * batch as the scroll loop discovers it (no URL-length limit, so it scales to
 * complete histories, and rows appear progressively rather than in one big
 * payload). A final "complete" message tells the receiver the stream is done.
 * If the popup is blocked — or the receiver never readies — it falls back to a
 * same-tab redirect carrying the whole scrape in the URL **fragment**
 * (`#data=...`), which never reaches any server.
 *
 * Parsing/classification stays in the app (`transactions.ts`) so the bookmarklet
 * string stays minimal and node-testable. The DOM selectors mirror Sony's order
 * page and will break if Sony restructures it; the heuristics are forgiving.
 */
import {
  HANDOFF_COMPLETE_TYPE,
  HANDOFF_FRAGMENT_KEY,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
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
 * Diagnostic logging for {@link resolveScrollContainer}: a `console.debug` line
 * describing the resolved scroller (how it matched, tag/class, scrollHeight vs
 * clientHeight) or a `console.warn` for the critical can't-scroll case where no
 * scrollable container was found at all.
 *
 * Self-contained (no other module references) so it survives `toString()`
 * embedding into the bookmarklet.
 */
function logScroller(el: HTMLElement | null, via: string): void {
  if (!el) {
    console.warn(
      `[psn-import] no scrollable container found (${via}) — lazy-load scrolling may not trigger more rows`
    );
    return;
  }
  console.debug(
    `[psn-import] scroll container via ${via}: <${el.tagName.toLowerCase()} class="${el.className}"> scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}`
  );
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
 * Self-contained (only references `findScrollableAncestor` and `logScroller`,
 * also embedded) so it survives `toString()` embedding, and unit-testable
 * against a real DOM.
 */
export function resolveScrollContainer(root: ParentNode): HTMLElement | null {
  const selectors = [".transaction-history-workstream-wrapper", ".transaction-history-workstream"];
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight) {
      logScroller(el, selector);
      return el;
    }
  }
  const fallback = findScrollableAncestor(root.querySelector(".transaction-history-screen-cards"));
  logScroller(fallback, "cards-ancestor fallback");
  return fallback;
}

/**
 * Exhaustive can't-scroll diagnostics. Dumps every scroll-container candidate
 * (each known selector plus the full ancestor chain above the cards container,
 * and the document-level scrollers) with the metrics that decide scrollability
 * — `overflowY`/`overflowX`, `scrollHeight`/`clientHeight`/`offsetHeight`,
 * `scrollTop`, and whether it actually overflows — so a single console capture
 * explains why scrolling did or did not trigger lazy-loading. Observational
 * only; never mutates the DOM. Self-contained for `toString()` embedding.
 */
// oxlint-disable-next-line complexity/complexity -- one cohesive diagnostic dump; splitting would fragment the candidate report
export function dumpScrollDiagnostics(root: ParentNode): void {
  const describe = (el: Element | null): string => {
    if (!el) return "(not found)";
    const cs = getComputedStyle(el);
    const offset = el instanceof HTMLElement ? el.offsetHeight : el.clientHeight;
    return `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ""} class="${el.className}"> overflowY=${cs.overflowY} overflowX=${cs.overflowX} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight} offsetHeight=${offset} scrollTop=${el.scrollTop} overflows=${el.scrollHeight > el.clientHeight}`;
  };
  const selectors = [
    ".transaction-history-workstream-wrapper",
    ".transaction-history-workstream",
    ".transaction-history-screen-cards",
  ];
  console.warn("[psn-import] scroll diagnostics — candidate dump:");
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    const accepted = el instanceof HTMLElement && el.scrollHeight > el.clientHeight;
    console.warn(
      `[psn-import]   ${selector}: ${describe(el)} -> ${accepted ? "ACCEPTED" : "rejected"}`
    );
  }
  let node: Element | null = root.querySelector(".transaction-history-screen-cards");
  let depth = 0;
  while (node) {
    console.warn(`[psn-import]   ancestor[${depth}]: ${describe(node)}`);
    node = node.parentElement;
    depth++;
  }
  const doc = root instanceof Document ? root : document;
  console.warn(`[psn-import]   document.scrollingElement: ${describe(doc.scrollingElement)}`);
  console.warn(`[psn-import]   document.documentElement: ${describe(doc.documentElement)}`);
  console.warn(`[psn-import]   document.body: ${describe(doc.body)}`);
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
  // Verbose diagnostic trace. Default ON: the whole point is to capture a
  // can't-scroll failure on the real PSN page in a single console session.
  const VERBOSE = true;
  const log = (...a) => { if (VERBOSE) console.log('[psn-import]', ...a); };
  const warn = (...a) => console.warn('[psn-import]', ...a);
  const group = (label) => { if (!VERBOSE) return; if (console.group) console.group('[psn-import] ' + label); else console.log('[psn-import] ' + label); };
  const groupEnd = () => { if (VERBOSE && console.groupEnd) console.groupEnd(); };
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

  // 2. Set up the lazy-load scroll machinery. The list lazy-loads on scroll: the
  //    spinner only shows while a batch is loading (and stays in the DOM hidden
  //    between batches), so we scroll → wait → repeat until the row count stops
  //    growing rather than stopping the instant the spinner is absent.
  const SEL = '.transaction-history-card';
  const spinnerEl = () => document.querySelector('.transaction-history__loading-spinner')
    || document.querySelector('[data-testid="loading-circle"]');
  const spinnerVisible = () => {
    const s = spinnerEl();
    return !!s && (s.offsetParent !== null || s.getClientRects().length > 0);
  };
  const logScroller = ${logScroller.toString()};
  const findScrollableAncestor = ${findScrollableAncestor.toString()};
  const resolveScrollContainer = ${resolveScrollContainer.toString()};
  const dumpScrollDiagnostics = ${dumpScrollDiagnostics.toString()};
  const countStabilised = ${countStabilised.toString()};
  const metrics = (el) => el ? { top: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight } : null;
  const scrollToBottom = () => {
    // Re-resolve every pass: the wrapper mounts/becomes scrollable only after
    // the panel has loaded enough rows, so a once-cached element goes stale.
    const scroller = resolveScrollContainer(document);
    const before = metrics(scroller);
    const method = scroller ? 'container.scrollTop' : 'lastCard.scrollIntoView';
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    // Belt-and-braces: scroll the last card into view, which scrolls whatever
    // ancestor is actually scrollable even when none was resolved above.
    const cards = document.querySelectorAll(SEL);
    const lastCard = cards[cards.length - 1];
    if (lastCard && lastCard.scrollIntoView) lastCard.scrollIntoView({ block: 'end' });
    const se = document.scrollingElement || document.documentElement;
    if (se) se.scrollTop = se.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    return { method, scroller, before, after: metrics(scroller) };
  };
  const settle = async () => {
    for (let i = 0; i < 8 && !spinnerVisible(); i++) await sleep(150);
    for (let i = 0; i < 40 && spinnerVisible(); i++) await sleep(300);
  };

  // Run one scroll pass with full per-pass tracing: card counts, scroll method,
  // scrollTop/scrollHeight movement, spinner state and wait duration before vs
  // after the lazy-load settle. Warns (and dumps the container report once) when
  // a pass fails to grow the row count — the core can't-scroll symptom.
  let dumped = false;
  const doScrollPass = async (label, pass, t0) => {
    const before = document.querySelectorAll(SEL).length;
    const spinBefore = spinnerVisible();
    const m = scrollToBottom();
    const waitStart = Date.now();
    await settle();
    const waitMs = Date.now() - waitStart;
    const after = document.querySelectorAll(SEL).length;
    const spinAfter = spinnerVisible();
    group(label + ' pass ' + pass + ' (+' + (Date.now() - t0) + 'ms)');
    log('method=' + m.method + (m.before
      ? ' scrollTop ' + m.before.top + '->' + (m.after ? m.after.top : '?') + ' scrollHeight ' + m.before.sh + '->' + (m.after ? m.after.sh : '?') + ' clientHeight ' + m.before.ch
      : ' (no resolved scroll container)'));
    log('cards ' + before + '->' + after + ' (delta ' + (after - before) + ') wait=' + waitMs + 'ms');
    log('spinner before=' + spinBefore + ' after=' + spinAfter);
    if (after <= before) {
      const a = m.after;
      const atBottom = a ? (a.sh - a.top - a.ch) <= 2 : 'n/a';
      warn(label + ' pass ' + pass + ' did NOT grow row count — scroll not triggering lazy-load; atBottom=' + atBottom + (a ? ' scrollTop=' + a.top + ' scrollHeight=' + a.sh + ' clientHeight=' + a.ch : ' (no resolved container)') + ' spinner=' + spinAfter);
      if (!dumped) { dumpScrollDiagnostics(document); dumped = true; }
    }
    groupEnd();
    return after;
  };

  // One-shot snapshot before any scrolling: row count, viewport, URL, and the
  // full container candidate dump, plus a loud warn on selector drift (0 cards).
  const snapshot = () => {
    const count = document.querySelectorAll(SEL).length;
    log('initial snapshot — url=' + location.href + ' viewport=' + window.innerWidth + 'x' + window.innerHeight + ' cards=' + count);
    if (count === 0) warn('card selector "' + SEL + '" matched 0 elements — selector drift or list not yet rendered');
    dumpScrollDiagnostics(document);
  };
  snapshot();

  // Scrape a single card. Per-card element ids are duplicated/invalid, so query
  // by class/structure within each card. The rich aria-label is a fallback.
  const AMOUNT = /-?\\s*(?:[£$€]|US\\$)\\s?\\d[\\d,]*(?:\\.\\d{1,2})?/;
  const DATE = /\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\b/;
  const scrapeCard = (card) => {
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
  };
  const makePayload = (rows) => ({ v: ${HANDOFF_VERSION}, source: location.host, scrapedAt: new Date().toISOString(), rows });

  // 3. Hand off. Prefer window.open + streamed postMessage batches; fall back to
  //    a one-shot fragment redirect (popup blocked, or receiver never readies).
  const fragmentRedirect = () => {
    const rows = [...document.querySelectorAll(SEL)].map(scrapeCard);
    location.href = IMPORT_URL + '#${HANDOFF_FRAGMENT_KEY}=' + encodeURIComponent(JSON.stringify(makePayload(rows)));
  };
  // Scroll the whole list to the bottom, loading every lazy batch. Used only by
  // the fragment fallback, which scrapes once at the end.
  const loadAll = async () => {
    const t0 = Date.now();
    const deadline = t0 + 180000;
    log('loadAll: start (fragment fallback path) — deadline in 180000ms');
    let last = -1, stable = 0, pass = 0, stop = 'deadline';
    while (Date.now() < deadline) {
      const count = document.querySelectorAll(SEL).length;
      if (count === last) {
        stable++;
        if (countStabilised(stable, spinnerVisible())) { stop = 'stabilised over ' + stable + ' passes, spinner hidden'; break; }
      } else { stable = 0; last = count; }
      pass++;
      await doScrollPass('loadAll', pass, t0);
    }
    warn('loadAll: done — stop=' + stop + ' passes=' + pass + ' cards=' + document.querySelectorAll(SEL).length + ' elapsed=' + (Date.now() - t0) + 'ms');
  };

  const w = window.open(IMPORT_URL);
  if (!w) { warn('popup blocked by window.open — falling back to fragment redirect'); await loadAll(); fragmentRedirect(); return; }
  log('popup opened — awaiting receiver ready ping (<=15000ms)');

  let ready = false;
  const onMessage = (e) => {
    if (e.origin !== APP_ORIGIN || !e.data) return;
    if (e.data.type === ${JSON.stringify(HANDOFF_READY_TYPE)}) ready = true;
  };
  window.addEventListener('message', onMessage);
  // Wait for the receiver to signal it is listening before streaming.
  const readyStart = Date.now();
  for (let i = 0; i < 60 && !ready; i++) await sleep(250);
  if (!ready) {
    warn('receiver ready ping NOT received within ' + (Date.now() - readyStart) + 'ms — falling back to fragment redirect');
    window.removeEventListener('message', onMessage);
    await loadAll();
    fragmentRedirect();
    return;
  }
  log('receiver ready ping received after ' + (Date.now() - readyStart) + 'ms — streaming batches');

  // Stream each freshly lazy-loaded batch as the scroll loop discovers it. We
  // post only the rows beyond what we have already sent; the receiver de-dupes,
  // so a re-sent row is harmless.
  let sent = 0;
  const flush = () => {
    const cards = [...document.querySelectorAll(SEL)];
    if (cards.length <= sent) return;
    const batch = cards.slice(sent).map(scrapeCard);
    sent = cards.length;
    try { w.postMessage({ type: ${JSON.stringify(HANDOFF_MESSAGE_TYPE)}, payload: makePayload(batch) }, APP_ORIGIN); log('streamed batch of ' + batch.length + ' rows (running total ' + sent + ')'); } catch (err) { warn('batch postMessage failed: ' + (err && err.message)); }
  };
  const t0 = Date.now();
  const deadline = t0 + 180000;
  let last = -1, stable = 0, pass = 0, stop = 'deadline';
  while (Date.now() < deadline) {
    const count = document.querySelectorAll(SEL).length;
    if (count === last) {
      stable++;
      if (countStabilised(stable, spinnerVisible())) { stop = 'stabilised over ' + stable + ' passes, spinner hidden'; break; }
    } else { stable = 0; last = count; }
    pass++;
    flush();
    await doScrollPass('stream', pass, t0);
  }
  flush();
  try { w.postMessage({ type: ${JSON.stringify(HANDOFF_COMPLETE_TYPE)} }, APP_ORIGIN); log('HANDOFF_COMPLETE sent — stop=' + stop + ' passes=' + pass + ' cards=' + document.querySelectorAll(SEL).length + ' streamed=' + sent + ' elapsed=' + (Date.now() - t0) + 'ms'); } catch (err) { warn('complete postMessage failed: ' + (err && err.message)); }
  window.removeEventListener('message', onMessage);
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
