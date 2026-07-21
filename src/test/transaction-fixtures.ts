import * as Transactions from "@/test/factories/transactions";

export {
  aggregate as transactionAggregate,
  freeClaim as freeClaimTransaction,
  historyResponse as transactionHistoryResponse,
  importTransaction as transactionImport,
  multiProductPurchase as multiProductPurchaseTransaction,
  nullNamePurchase as nullNamePurchaseTransaction,
  preOrderPurchase as preOrderPurchaseTransaction,
  row as transactionRow,
  subscriptionPurchase as subscriptionPurchaseTransaction,
  walletFunding as walletFundingTransaction,
} from "@/test/factories/transactions";

// Compatibility exports remain until transaction consumers migrate to factories.
export const multiProductPurchase = Transactions.multiProductPurchase();
export const preOrderPurchase = Transactions.preOrderPurchase();
export const subscriptionPurchase = Transactions.subscriptionPurchase();
export const freeClaim = Transactions.freeClaim();
export const nullNamePurchase = Transactions.nullNamePurchase();
export const walletFunding = Transactions.walletFunding();
export const allTransactions = Transactions.aggregate();
