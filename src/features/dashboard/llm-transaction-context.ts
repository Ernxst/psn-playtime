import type { TransactionRow } from "@/domain/transactions";
import type { DashboardData } from "@/server/providers/account/snapshot";
import {
  summariseAddOns,
  summarisePriceContext,
  summariseSpend,
  type AddOnSummary,
  type PriceContextSummary,
  type SpendSummary,
} from "./spend";

export interface PromptTransactionContext {
  hasTransactions: boolean;
  addOns: AddOnSummary[];
  addOnCounts: ReadonlyMap<string, number>;
  priceContexts: PriceContextSummary[];
  priceContextByTitle: ReadonlyMap<string, PriceContextSummary>;
  spend?: SpendSummary;
}

/**
 * Whether imported transaction history is present. The transaction-only signal
 * needed to fold in the spend questions, available without a `DashboardData`.
 */
export function hasTransactionHistory(transactions?: readonly TransactionRow[]): boolean {
  return Boolean(transactions && transactions.length > 0);
}

export function buildPromptTransactionContext(
  data: DashboardData,
  transactions?: readonly TransactionRow[]
): PromptTransactionContext {
  if (!transactions || transactions.length === 0) {
    return {
      hasTransactions: false,
      addOns: [],
      addOnCounts: new Map(),
      priceContexts: [],
      priceContextByTitle: new Map(),
    };
  }

  const txs = [...transactions];
  const addOns = summariseAddOns(data, txs);
  const priceContexts = summarisePriceContext(data, txs);

  return {
    hasTransactions: true,
    addOns,
    addOnCounts: new Map(addOns.map((g) => [g.titleId, g.addOnCount])),
    priceContexts,
    priceContextByTitle: new Map(priceContexts.map((c) => [c.titleId, c])),
    spend: summariseSpend(data, txs),
  };
}
