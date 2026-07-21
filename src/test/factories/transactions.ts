import type {
  ApiProductPurchase,
  ApiTransaction,
  TransactionImport,
  TransactionRow,
} from "@/domain/transactions";

type ApiTransactionOverrides = Omit<Partial<ApiTransaction>, "purchaseDetails"> & {
  readonly purchaseDetails?: { readonly productPurchases: ApiProductPurchase[] } | null;
};

const cloneTransaction = (transaction: ApiTransaction): ApiTransaction => ({
  ...transaction,
  purchaseDetails: transaction.purchaseDetails
    ? {
        productPurchases: transaction.purchaseDetails.productPurchases.map((product) => ({
          ...product,
        })),
      }
    : transaction.purchaseDetails,
});

const apiTransaction = (
  base: ApiTransaction,
  overrides: ApiTransactionOverrides = {}
): ApiTransaction =>
  cloneTransaction({
    ...base,
    ...overrides,
    purchaseDetails:
      overrides.purchaseDetails === undefined ? base.purchaseDetails : overrides.purchaseDetails,
  });

export function multiProductPurchase(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
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
    },
    overrides
  );
}

export function preOrderPurchase(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
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
    },
    overrides
  );
}

export function subscriptionPurchase(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
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
    },
    overrides
  );
}

export function freeClaim(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
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
    },
    overrides
  );
}

export function nullNamePurchase(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
      id: "700000000000006",
      date: "2025-07-01T10:00:00.000Z",
      transactionType: "PRODUCT_PURCHASE",
      invoiceType: "PRODUCT_PURCHASE",
      displayOfTransactionValue: "£7.99",
      purchaseDetails: {
        productPurchases: [
          {
            productName: null,
            skuId: "EP1234-PPSA09999_00-DELISTED00000000-E001",
            skuType: "STANDARD",
            quantity: 1,
            total: 799,
            totalFormatted: "£7.99",
            originalPrice: 799,
            discount: 0,
            orderItemId: "555555555551",
          },
        ],
      },
    },
    overrides
  );
}

export function walletFunding(overrides: ApiTransactionOverrides = {}): ApiTransaction {
  return apiTransaction(
    {
      id: "700000000000005",
      date: "2025-02-07T09:00:00.000Z",
      transactionType: "WALLET_FUNDING",
      invoiceType: "WALLET_FUNDING",
      displayOfTransactionValue: "£10.00",
      purchaseDetails: null,
    },
    overrides
  );
}

export function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    transactionId: "700000000000001",
    key: "111111111111",
    date: "2025-08-29T13:31:23.987Z",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Hades",
    skuId: "EP4040-PPSA01234_00-HADES00000000000-E001",
    skuType: "STANDARD",
    quantity: 1,
    amountMinor: 1599,
    currency: "£",
    displayAmount: "£15.99",
    originalPriceMinor: 1599,
    discountMinor: 0,
    ...overrides,
  };
}

export function importRecord(
  overrides: Omit<Partial<TransactionImport>, "transactions"> & {
    readonly transactions?: ReadonlyArray<TransactionRow>;
  } = {}
): TransactionImport {
  return {
    importedAt: "2025-08-30T00:00:00.000Z",
    source: "store.playstation.com",
    ...overrides,
    transactions: (overrides.transactions ?? [row()]).map((row) => ({ ...row })),
  };
}

export function aggregate(
  transactions: ReadonlyArray<ApiTransaction> = [
    multiProductPurchase(),
    preOrderPurchase(),
    subscriptionPurchase(),
    freeClaim(),
    nullNamePurchase(),
    walletFunding(),
  ]
): ApiTransaction[] {
  return transactions.map(cloneTransaction);
}

export function historyResponse(
  transactions: ReadonlyArray<ApiTransaction>,
  options: {
    readonly hasMore?: boolean;
    readonly nextEndDate?: string | null;
    readonly errors?: ReadonlyArray<{ readonly message: string }>;
  } = {}
) {
  return {
    data: {
      transactionHistoryRetrieve: {
        transactions: aggregate(transactions),
        hasMore: options.hasMore ?? false,
        nextEndDate: options.nextEndDate ?? null,
      },
    },
    ...(options.errors ? { errors: options.errors.map((error) => ({ ...error })) } : {}),
  };
}
