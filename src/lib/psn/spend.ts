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
import { round, yearOf } from "./util";

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

/** One matched title with its total spend (base game + add-ons). */
export interface TitleSpend {
  titleId: string;
  name: string;
  spend: number;
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
  /** Every matched title with spend > 0, highest total spend first. */
  byTitle: TitleSpend[];
}

export interface AddOnSummary {
  titleId: string;
  name: string;
  addOnCount: number;
}

/** Normalise a title for cross-source matching (mirrors the server normaliser). */
function normTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

const ADD_ON_SKU_TYPES = [
  "ADD_ON",
  "ADD-ON",
  "ADDON",
  "DLC",
  "EXPANSION",
  "SEASON_PASS",
  "SEASON PASS",
];

// Strong add-on markers carried in the sku id's content segment, e.g.
// `EP4082-PPSA01491_00-EXPANSION1000000-U001`. PSN sometimes ships expansions
// as a `PRE_ORDER` skuType with a neutral product name (no add-on keyword), so
// the content code is the only reliable signal that the purchase is an add-on.
const ADD_ON_SKU_ID_MARKERS = ["EXPANSION", "DLC", "ADDON", "SEASONPASS"];

const ADD_ON_NAME_TERMS = [
  "season pass",
  "dlc",
  "expansion",
  "add on",
  "add-on",
  "deluxe upgrade",
  "ultimate upgrade",
  "upgrade",
  "pack",
];

const BASE_GAME_NAME_TERMS = [
  "standard edition",
  "deluxe edition",
  "ultimate edition",
  "complete edition",
  "definitive edition",
  "gold edition",
  "game of the year",
  "bundle",
  "collection",
];

function isAddOnSkuType(skuType: string | undefined): boolean {
  if (!skuType) return false;
  const normalised = skuType.toUpperCase().replace(/[_-]+/g, " ");
  return ADD_ON_SKU_TYPES.some((type) => normalised.includes(type.replace(/[_-]+/g, " ")));
}

/**
 * Add-on detected from the sku id's content segment (third `-`-delimited part,
 * e.g. `EXPANSION1000000`). Only the content segment is inspected so region,
 * title-id and edition segments cannot trigger a false positive.
 */
function isAddOnSkuId(skuId: string | undefined): boolean {
  if (!skuId) return false;
  const content = skuId.split("-")[2];
  if (!content) return false;
  const normalised = content.toUpperCase();
  return ADD_ON_SKU_ID_MARKERS.some((marker) => normalised.includes(marker));
}

function isBaseGameEdition(name: string): boolean {
  return BASE_GAME_NAME_TERMS.some((term) => name.includes(term));
}

function isNamedAddOn(productName: string, game: GamePlay | undefined): boolean {
  const name = normTitle(productName);
  if (name === "" || isBaseGameEdition(name)) return false;
  if (ADD_ON_NAME_TERMS.some((term) => name.includes(term))) return true;
  if (!game) return false;
  const gameName = normTitle(game.name);
  return gameName !== "" && name.startsWith(`${gameName} `) && productName.includes(" - ");
}

export function isAddOnPurchase(tx: TransactionRow, game?: GamePlay): boolean {
  if (tx.kind !== "purchase") return false;
  if (isAddOnSkuType(tx.skuType)) return true;
  if (isAddOnSkuId(tx.skuId)) return true;
  return isNamedAddOn(tx.productName, game);
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
      hours: round(g.hours, 2),
      spend: round(spend, 2),
      perHour: round(spend / g.hours, 2),
    });
  }
  return leaders.sort((a, b) => a.perHour - b.perHour);
}

/**
 * Per-title total spend (base game + add-ons), highest first. Includes every
 * matched title with spend > 0 — even those with no playtime — unlike the value
 * {@link buildLeaderboard}, which is filtered to `hours > 0`. Top-ups never
 * reach `spendByTitle`, so they are excluded by construction.
 */
function buildByTitle(games: GamePlay[], spendByTitle: Map<string, number>): TitleSpend[] {
  const titles: TitleSpend[] = [];
  for (const g of games) {
    const spend = spendByTitle.get(g.titleId);
    if (spend === undefined || spend <= 0) continue;
    titles.push({ titleId: g.titleId, name: g.name, spend: round(spend, 2) });
  }
  return titles.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
}

function buildByYear(byYear: Acc["byYear"]): YearSpend[] {
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, spend: round(v.spend, 2), purchases: v.purchases }))
    .sort((a, b) => a.year - b.year);
}

function countAddOns(
  games: GamePlay[],
  transactions: readonly TransactionRow[]
): Map<string, number> {
  const byName = indexByName(games);
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    const game = matchGame(tx, games, byName);
    if (!game || !isAddOnPurchase(tx, game)) continue;
    counts.set(game.titleId, (counts.get(game.titleId) ?? 0) + 1);
  }
  return counts;
}

function buildAddOnSummaries(
  games: GamePlay[],
  counts: ReadonlyMap<string, number>
): AddOnSummary[] {
  const summaries: AddOnSummary[] = [];
  for (const game of games) {
    const addOnCount = counts.get(game.titleId);
    if (addOnCount === undefined) continue;
    summaries.push({
      titleId: game.titleId,
      name: game.name,
      addOnCount,
    });
  }
  return summaries;
}

export function summariseAddOns(
  data: DashboardData,
  transactions: readonly TransactionRow[]
): AddOnSummary[] {
  return buildAddOnSummaries(data.games, countAddOns(data.games, transactions));
}

/** Coarse intent label derived from what was paid vs the original price. */
type PriceContextLabel = "free" | "deep-sale" | "discounted" | "full-price";

export interface PriceContextSummary {
  titleId: string;
  name: string;
  label: PriceContextLabel;
  /** Amount actually paid for the base game, in minor units. */
  paidMinor: number;
  /** Pre-discount price in minor units, when the import carried it. */
  originalPriceMinor?: number;
  currency: string;
}

// Price-context thresholds, expressed as the share knocked off the original
// price: >= 50% off is a "deep-sale", any discount >= 5% is "discounted", and
// less than that (or no discount data) is "full-price". The 5% floor ignores
// rounding/region noise so a near-full price is not mislabelled as a sale.
const DEEP_SALE_FRACTION = 0.5;
const DISCOUNT_FRACTION = 0.05;

/** Pre-discount price in minor units: explicit original, else paid + discount. */
function originalPrice(tx: TransactionRow): number | undefined {
  if (tx.originalPriceMinor !== undefined) return tx.originalPriceMinor;
  if (tx.discountMinor !== undefined) return tx.amountMinor + tx.discountMinor;
  return undefined;
}

function labelForFraction(fraction: number): PriceContextLabel {
  if (fraction >= DEEP_SALE_FRACTION) return "deep-sale";
  if (fraction >= DISCOUNT_FRACTION) return "discounted";
  return "full-price";
}

/**
 * Classify a base-game purchase by how much it was discounted. Uses
 * `originalPriceMinor`/`discountMinor` when present; with neither we only know
 * free vs paid, so any paid amount falls back to "full-price".
 */
function priceContextLabel(tx: TransactionRow): PriceContextLabel {
  if (tx.amountMinor === 0) return "free";
  const original = originalPrice(tx);
  if (original === undefined || original <= 0) return "full-price";
  return labelForFraction((original - tx.amountMinor) / original);
}

/** A purchase of the base game itself (not an add-on) that matched a title. */
function isBaseGamePurchase(tx: TransactionRow, game: GamePlay | undefined): game is GamePlay {
  return tx.kind === "purchase" && game !== undefined && !isAddOnPurchase(tx, game);
}

/** First base-game (non-add-on) purchase per matched title, keyed by titleId. */
function priceContextByTitle(
  games: GamePlay[],
  transactions: readonly TransactionRow[]
): Map<string, PriceContextSummary> {
  const byName = indexByName(games);
  const contexts = new Map<string, PriceContextSummary>();
  for (const tx of transactions) {
    const game = matchGame(tx, games, byName);
    if (!isBaseGamePurchase(tx, game)) continue;
    if (contexts.has(game.titleId)) continue;
    contexts.set(game.titleId, {
      titleId: game.titleId,
      name: game.name,
      label: priceContextLabel(tx),
      paidMinor: tx.amountMinor,
      originalPriceMinor: tx.originalPriceMinor,
      currency: tx.currency,
    });
  }
  return contexts;
}

/**
 * Per-game purchase-price context, attributed through the same spend→game
 * matcher as {@link summariseAddOns}. Unmatched purchases are ignored.
 */
export function summarisePriceContext(
  data: DashboardData,
  transactions: readonly TransactionRow[]
): PriceContextSummary[] {
  const contexts = priceContextByTitle(data.games, transactions);
  return data.games
    .map((g) => contexts.get(g.titleId))
    .filter((c): c is PriceContextSummary => c !== undefined);
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
    totalSpend: round(acc.totalSpend, 2),
    topUpTotal: round(acc.topUpTotal, 2),
    purchaseCount: acc.purchaseCount,
    paidGames: acc.spendByTitle.size,
    freeGames: games.length - acc.spendByTitle.size,
    unmatchedSpend: round(acc.unmatchedSpend, 2),
    byYear: buildByYear(acc.byYear),
    leaderboard: buildLeaderboard(games, acc.spendByTitle),
    byTitle: buildByTitle(games, acc.spendByTitle),
  };
}
