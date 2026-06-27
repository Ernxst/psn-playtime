/**
 * Builds the one-click transaction-history bookmarklet.
 *
 * The bookmarklet runs on the user's own already-authenticated PlayStation
 * order/transaction-history page (same-origin with the data). It auto-scrolls /
 * clicks "load more" until no new `.transaction-history-card` rows appear,
 * scrapes each row's raw date/amount/description text, then redirects to this
 * app's `/import` route with the payload in the URL **fragment** (`#data=...`).
 *
 * Handoff choice: the fragment redirect is the primary mechanism — it is the
 * simplest fully client-side path (the `#` fragment never hits any server, so no
 * CSP/CORS concerns) and the app parses the raw rows with the shared
 * `parseTransactions`. The bookmarklet only *scrapes and sends* same-origin data
 * outward, which the browser permits.
 *
 * Fragility: the DOM selectors mirror Sony's order page and will break if Sony
 * restructures it; the amount/date heuristics are deliberately forgiving.
 */
import { HANDOFF_FRAGMENT_KEY, HANDOFF_VERSION } from "./transactions";

/** The IIFE body, parameterised by the app's import URL. */
function source(importUrl: string): string {
  return `(async () => {
  const SEL = '.transaction-history-card';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickLoadMore = () => {
    const btn = [...document.querySelectorAll('button,a')].find((el) =>
      /load more|show more|see more/i.test(el.textContent || '')
    );
    if (btn) { btn.click(); return true; }
    return false;
  };
  let stable = 0;
  for (let i = 0; i < 400 && stable < 3; i++) {
    const before = document.querySelectorAll(SEL).length;
    window.scrollTo(0, document.body.scrollHeight);
    clickLoadMore();
    await sleep(700);
    stable = document.querySelectorAll(SEL).length === before ? stable + 1 : 0;
  }
  const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
  const AMOUNT = /-?\\s*(?:[£$€]|US\\$)\\s?\\d[\\d,]*(?:\\.\\d{1,2})?/;
  const DATE = /\\b\\d{1,2}\\s+\\w{3,9}\\s+\\d{4}\\b|\\b\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\b/;
  const rows = [...document.querySelectorAll(SEL)].map((card) => {
    const whole = text(card);
    const amount = (whole.match(AMOUNT) || [''])[0].trim();
    const date = (whole.match(DATE) || [''])[0].trim();
    const heading = card.querySelector('h1,h2,h3,h4,[class*=title],[class*=name],[class*=product]');
    let description = text(heading);
    if (!description) {
      description = whole.replace(AMOUNT, '').replace(DATE, '').replace(/\\s+/g, ' ').trim();
    }
    return { date, amount, description };
  });
  const payload = { v: ${HANDOFF_VERSION}, source: location.host, scrapedAt: new Date().toISOString(), rows };
  location.href = ${JSON.stringify(importUrl)} + '#${HANDOFF_FRAGMENT_KEY}=' + encodeURIComponent(JSON.stringify(payload));
})();`;
}

/**
 * The full `javascript:` bookmarklet URI for the given app origin.
 * `appOrigin` is e.g. `https://psn.example.dev` (no trailing slash needed).
 */
export function bookmarkletHref(appOrigin: string): string {
  const importUrl = `${appOrigin.replace(/\/$/, "")}/import`;
  return `javascript:${encodeURIComponent(source(importUrl))}`;
}
