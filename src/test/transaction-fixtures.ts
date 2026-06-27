/**
 * PII-free `transactionHistoryRetrieve` fixtures, trimmed to the fields the app
 * parses. Shapes mirror the live GraphQL response (see the project's
 * `transactions.json` capture) without real account data.
 */
import type { ApiTransaction } from "@/lib/psn/transactions";

/** A purchase carrying two product lines (base game + add-on). */
export const multiProductPurchase: ApiTransaction = {
  id: "700000000000001",
  date: "2025-08-29T13:31:23.987Z",
  transactionType: "PRODUCT_PURCHASE",
  invoiceType: "PRODUCT_PURCHASE",
  displayOfTransactionValue: "£20.98",
  purchaseDetails: {
    productPurchases: [
      {
        productName: "Hades",
        skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
        skuType: "STANDARD",
        quantity: 1,
        total: 1599,
        totalFormatted: "£15.99",
        originalPrice: 1599,
        discount: 0,
        orderItemId: "111111111111",
      },
      {
        productName: "Hades Original Soundtrack",
        skuId: "EP4040-PPSA01234_00-HADESOST00000000-E001",
        skuType: "ADD_ON",
        quantity: 1,
        total: 499,
        totalFormatted: "£4.99",
        originalPrice: 499,
        discount: 0,
        orderItemId: "111111111112",
      },
    ],
  },
};

/** A pre-order purchase. */
export const preOrderPurchase: ApiTransaction = {
  id: "700000000000002",
  date: "2025-08-26T13:58:06.201Z",
  transactionType: "PRODUCT_PURCHASE",
  invoiceType: "PRODUCT_PURCHASE",
  displayOfTransactionValue: "£39.99",
  purchaseDetails: {
    productPurchases: [
      {
        productName: "EA SPORTS™ WRC 24",
        skuId: "EP0006-PPSA06092_00-WRC2023PS5GAME00-E004",
        skuType: "PRE_ORDER",
        quantity: 1,
        total: 3999,
        totalFormatted: "£39.99",
        originalPrice: 3999,
        discount: 0,
        orderItemId: "222222222221",
      },
    ],
  },
};

/** A subscription cycle renewal. */
export const subscriptionPurchase: ApiTransaction = {
  id: "700000000000003",
  date: "2025-08-04T14:21:47.848Z",
  transactionType: "CYCLE_SUBSCRIPTION",
  invoiceType: "PRODUCT_PURCHASE",
  displayOfTransactionValue: "£59.99",
  purchaseDetails: {
    productPurchases: [
      {
        productName: "PlayStation Plus Essential: 12 Month Subscription",
        skuId: "IP9102-PPSA06902_00-PLUS1T12M0000000-E002",
        skuType: "SUBSCRIPTION",
        quantity: 1,
        total: 5999,
        totalFormatted: "£59.99",
        originalPrice: 5999,
        discount: 0,
        orderItemId: "333333333331",
      },
    ],
  },
};

/** A free claim (100% discount): retained as a row, but £0 is not spend. */
export const freeClaim: ApiTransaction = {
  id: "700000000000004",
  date: "2025-09-21T12:05:40.731Z",
  transactionType: "PRODUCT_PURCHASE",
  invoiceType: "PRODUCT_PURCHASE",
  displayOfTransactionValue: "£0.00",
  purchaseDetails: {
    productPurchases: [
      {
        productName: "PlayStation®Plus ICONS Pack",
        skuId: "EP9000-PPSA00000_00-ICONSPACK0000000-E001",
        skuType: "ADD_ON",
        quantity: 1,
        total: 0,
        totalFormatted: "£0.00",
        originalPrice: 4499,
        discount: 4499,
        orderItemId: "444444444441",
      },
    ],
  },
};

/** A non-purchase transaction: funding the wallet. */
export const walletFunding: ApiTransaction = {
  id: "700000000000005",
  date: "2025-02-07T09:00:00.000Z",
  transactionType: "WALLET_FUNDING",
  invoiceType: "WALLET_FUNDING",
  displayOfTransactionValue: "£10.00",
  purchaseDetails: null,
};

/** Every fixture in one list, for end-to-end flatten tests. */
export const allTransactions: ApiTransaction[] = [
  multiProductPurchase,
  preOrderPurchase,
  subscriptionPurchase,
  freeClaim,
  walletFunding,
];
