/**
 * Joins imported PSN transactions to playtime (by title) to answer "what did
 * each game cost me per hour". Pure selectors over `DashboardData` + the parsed
 * `Transaction[]`; nothing here touches the network or React.
 *
 * Caveat: PSN purchases are matched to library titles by `skuId` then product
 * name, so DLC, bundles and renamed re-releases may not line up perfectly.
 * Anything that fails to match is surfaced as `unmatchedSpend` rather than hidden.
 */
import type { TransactionRow } from "./transactions";
import type { DashboardData, GamePlay } from "./types";

/** One game with its matched spend and resulting value. */
interface SpendLeader {
  titleId: string;
  name: string;
  hours: number;
  spend: number;
  /** £ per hour played (spend ÷ hours). */
  perHour: number;
}

interface YearSpend {
  year: number;
  spend: number;
  purchases: number;
}

export interface SpendSummary {
  /** Currency symbol/code from the imported data ("" when unknown). */
  currency: string;
  /** Total of all purchase rows. */
  totalSpend: number;
  /** Total of all wallet top-up rows. */
  topUpTotal: number;
  purchaseCount: number;
  /** Library games matched to at least one purchase. */
  paidGames: number;
  /** Library games with no matched purchase (PS Plus, pre-installs, free). */
  freeGames: number;
  /** Purchase spend that matched no library title. */
  unmatchedSpend: number;
  byYear: YearSpend[];
  /** Best value first (lowest £/hour). */
  leaderboard: SpendLeader[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Normalise a title for cross-source matching (mirrors the server normaliser). */
function normTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Year of an ISO/`YYYY-...` date, or `undefined` when unparseable. */
function yearOf(date: string): number | undefined {
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(date);
  if (iso) return Number(iso[1]);
  const year = new Date(date).getUTCFullYear();
  return Number.isNaN(year) ? undefined : year;
}

/** Index library games by normalised name, keeping the first per name. */
function indexByName(games: GamePlay[]): Map<string, GamePlay> {
  const byName = new Map<string, GamePlay>();
  for (const game of games) {
    const key = normTitle(game.name);
    if (key !== "" && !byName.has(key)) byName.set(key, game);
  }
  return byName;
}

/** Match by skuId, which embeds the title id (e.g. `EP0006-PPSA06092_00-...`). */
function matchBySku(skuId: string | undefined, games: GamePlay[]): GamePlay | undefined {
  if (!skuId) return undefined;
  return games.find((g) => g.titleId !== "" && skuId.includes(g.titleId));
}

/** Match a normalised name fully contained in the product name. */
function matchByName(key: string, games: GamePlay[]): GamePlay | undefined {
  return games.find((g) => {
    const name = normTitle(g.name);
    return name !== "" && key.includes(name);
  });
}

/**
 * Find the library game a purchase refers to, if any. Prefers the stable
 * `skuId`, then falls back to matching the product name.
 */
function matchGame(
  tx: TransactionRow,
  games: GamePlay[],
  byName: Map<string, GamePlay>
): GamePlay | undefined {
  const bySku = matchBySku(tx.skuId, games);
  if (bySku) return bySku;
  const key = normTitle(tx.productName);
  if (key === "") return undefined;
  return byName.get(key) ?? matchByName(key, games);
}

interface Acc {
  spendByTitle: Map<string, number>;
  byYear: Map<number, { spend: number; purchases: number }>;
  totalSpend: number;
  topUpTotal: number;
  purchaseCount: number;
  unmatchedSpend: number;
  currency: string;
}

function emptyAcc(): Acc {
  return {
    spendByTitle: new Map(),
    byYear: new Map(),
    totalSpend: 0,
    topUpTotal: 0,
    purchaseCount: 0,
    unmatchedSpend: 0,
    currency: "",
  };
}

function addToYear(acc: Acc, year: number, amount: number): void {
  const bucket = acc.byYear.get(year) ?? { spend: 0, purchases: 0 };
  bucket.spend += amount;
  bucket.purchases += 1;
  acc.byYear.set(year, bucket);
}

function recordPurchase(
  acc: Acc,
  tx: TransactionRow,
  games: GamePlay[],
  byName: Map<string, GamePlay>
): void {
  const amount = tx.amountMinor / 100;
  acc.purchaseCount += 1;
  acc.totalSpend += amount;
  const year = yearOf(tx.date);
  if (year !== undefined) addToYear(acc, year, amount);
  const game = matchGame(tx, games, byName);
  if (!game) {
    acc.unmatchedSpend += amount;
    return;
  }
  acc.spendByTitle.set(game.titleId, (acc.spendByTitle.get(game.titleId) ?? 0) + amount);
}

function recordTransaction(
  acc: Acc,
  tx: TransactionRow,
  games: GamePlay[],
  byName: Map<string, GamePlay>
): void {
  if (acc.currency === "" && tx.currency !== "") acc.currency = tx.currency;
  // Minor units (integer pennies) → major units for the spend arithmetic.
  const amount = tx.amountMinor / 100;
  // Free claims (PS Plus monthly games, 100%-off) are not spend.
  if (amount === 0) return;
  if (tx.kind === "top-up") {
    acc.topUpTotal += amount;
    return;
  }
  recordPurchase(acc, tx, games, byName);
}

function buildLeaderboard(games: GamePlay[], spendByTitle: Map<string, number>): SpendLeader[] {
  const leaders: SpendLeader[] = [];
  for (const g of games) {
    const spend = spendByTitle.get(g.titleId);
    if (spend === undefined || g.hours <= 0) continue;
    leaders.push({
      titleId: g.titleId,
      name: g.name,
      hours: round2(g.hours),
      spend: round2(spend),
      perHour: round2(spend / g.hours),
    });
  }
  return leaders.sort((a, b) => a.perHour - b.perHour);
}

function buildByYear(byYear: Acc["byYear"]): YearSpend[] {
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, spend: round2(v.spend), purchases: v.purchases }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Join transactions to playtime by title and compute spend value.
 *
 * Top-ups are excluded from spend totals (they fund the wallet, they are not a
 * cost per game); only `kind === "purchase"` rows count toward spend.
 */
export function summariseSpend(data: DashboardData, transactions: TransactionRow[]): SpendSummary {
  const games = data.games;
  const byName = indexByName(games);
  const acc = emptyAcc();
  for (const tx of transactions) recordTransaction(acc, tx, games, byName);

  return {
    currency: acc.currency,
    totalSpend: round2(acc.totalSpend),
    topUpTotal: round2(acc.topUpTotal),
    purchaseCount: acc.purchaseCount,
    paidGames: acc.spendByTitle.size,
    freeGames: games.length - acc.spendByTitle.size,
    unmatchedSpend: round2(acc.unmatchedSpend),
    byYear: buildByYear(acc.byYear),
    leaderboard: buildLeaderboard(games, acc.spendByTitle),
  };
}
