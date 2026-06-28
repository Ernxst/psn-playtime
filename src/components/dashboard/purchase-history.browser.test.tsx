import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import type { TransactionRow } from "@/lib/psn/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
import { PurchaseHistorySection } from "./purchase-history";

/** The demo library as it would arrive for a real, signed-in account. */
const realDashboard = { ...demoDashboard, isDemo: false };

function row(overrides: Partial<TransactionRow> & Pick<TransactionRow, "key">): TransactionRow {
  return {
    transactionId: overrides.key,
    date: "2022-05-12",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "Satisfactory",
    quantity: 1,
    amountMinor: 3300,
    currency: "£",
    displayAmount: "£33.00",
    ...overrides,
  };
}

function seed(transactions: TransactionRow[]) {
  saveTransactionImport({
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(clearTransactionImport);
}

test("lists imported transactions with product, amount and type", async () => {
  seed([row({ key: "t1", productName: "Hollow Knight", amountMinor: 1099, currency: "£" })]);

  await render(<PurchaseHistorySection data={realDashboard} />);

  await expect.element(page.getByText("Your purchase history")).toBeVisible();
  await expect.element(page.getByText("Hollow Knight")).toBeVisible();
  await expect.element(page.getByText("£10.99")).toBeVisible();
  await expect.element(page.getByText("Purchase", { exact: true })).toBeVisible();
});

test("shows the original price and discount when present", async () => {
  seed([
    row({
      key: "t1",
      productName: "Elden Ring",
      amountMinor: 4000,
      originalPriceMinor: 5000,
      discountMinor: 1000,
    }),
  ]);

  await render(<PurchaseHistorySection data={realDashboard} />);

  await expect.element(page.getByText("£50.00")).toBeVisible();
  await expect.element(page.getByText("−£10.00")).toBeVisible();
});

test("renders nothing for the demo dashboard even when an import exists", async () => {
  seed([row({ key: "t1" })]);

  await render(<PurchaseHistorySection data={demoDashboard} />);

  await expect.element(page.getByText("Your purchase history")).not.toBeInTheDocument();
});

test("clicking the Amount paid header re-sorts the rows in both directions", async () => {
  seed([
    row({ key: "cheap", productName: "Cheap Game", amountMinor: 500, date: "2022-01-01" }),
    row({ key: "dear", productName: "Dear Game", amountMinor: 6000, date: "2022-06-01" }),
  ]);

  const { container } = await render(<PurchaseHistorySection data={realDashboard} />);

  // Default sort is date-descending: the June purchase leads.
  await expect.poll(() => container.querySelector("tbody tr")?.textContent).toContain("Dear Game");

  // First click sorts amount descending — the dearest still leads.
  await page.getByRole("button", { name: "Sort by Amount paid" }).click();

  await expect.poll(() => container.querySelector("tbody tr")?.textContent).toContain("Dear Game");

  // Second click flips to ascending — the cheapest leads instead.
  await page.getByRole("button", { name: "Sort by Amount paid" }).click();

  await expect.poll(() => container.querySelector("tbody tr")?.textContent).toContain("Cheap Game");
});
