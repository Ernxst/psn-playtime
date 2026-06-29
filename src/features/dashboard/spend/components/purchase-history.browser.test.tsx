import type { ReactNode } from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import { PurchaseHistorySection } from "./purchase-history";

/** Render under the atom provider so `useTransactionImport` shares the registry that imperative writes target. */
function renderWithAtoms(ui: ReactNode) {
  return render(ui, { wrapper: TestAtomProvider });
}

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
  testTransactionStore.save({
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(() => testTransactionStore.clear());
}

describe("PurchaseHistorySection", () => {
  it("lists imported transactions with product, amount and type", async () => {
    seed([row({ key: "t1", productName: "Hollow Knight", amountMinor: 1099, currency: "£" })]);

    await renderWithAtoms(<PurchaseHistorySection data={realDashboard} />);

    await expect.element(page.getByText("Your purchase history")).toBeVisible();
    await expect.element(page.getByText("Hollow Knight")).toBeVisible();
    await expect.element(page.getByText("£10.99")).toBeVisible();
    await expect.element(page.getByText("Purchase", { exact: true })).toBeVisible();
  });

  it("shows the original price and discount in their own columns when present", async () => {
    seed([
      row({
        key: "t1",
        productName: "Elden Ring",
        amountMinor: 4000,
        originalPriceMinor: 5000,
        discountMinor: 1000,
      }),
    ]);

    await renderWithAtoms(<PurchaseHistorySection data={realDashboard} />);

    await expect.element(page.getByRole("button", { name: "Sort by Original" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Discount" })).toBeVisible();
    await expect.element(page.getByText("£50.00")).toBeVisible();
    await expect.element(page.getByText("−£10.00")).toBeVisible();
  });

  it("clicking the Original header re-sorts the rows and sinks rows without an original price", async () => {
    seed([
      row({ key: "plain", productName: "Plain Game", date: "2022-06-01" }),
      row({
        key: "low",
        productName: "Low Original",
        date: "2022-02-01",
        originalPriceMinor: 2000,
      }),
      row({
        key: "high",
        productName: "High Original",
        date: "2022-01-01",
        originalPriceMinor: 9000,
      }),
    ]);

    const { container } = await renderWithAtoms(<PurchaseHistorySection data={realDashboard} />);

    // Descending by original price: the highest leads, the row without data sinks last.
    await page.getByRole("button", { name: "Sort by Original" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("High Original");
    await expect
      .poll(() => container.querySelector("tbody tr:last-child")?.textContent)
      .toContain("Plain Game");

    // Ascending: the lowest leads, the row without data still sinks last.
    await page.getByRole("button", { name: "Sort by Original" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Low Original");
    await expect
      .poll(() => container.querySelector("tbody tr:last-child")?.textContent)
      .toContain("Plain Game");
  });

  it("clicking the Discount header re-sorts the rows and sinks rows without a discount", async () => {
    seed([
      row({ key: "plain", productName: "Plain Game", date: "2022-06-01" }),
      row({
        key: "small",
        productName: "Small Discount",
        date: "2022-02-01",
        discountMinor: 500,
      }),
      row({
        key: "big",
        productName: "Big Discount",
        date: "2022-01-01",
        discountMinor: 4000,
      }),
    ]);

    const { container } = await renderWithAtoms(<PurchaseHistorySection data={realDashboard} />);

    // Descending by discount: the largest leads, the row without data sinks last.
    await page.getByRole("button", { name: "Sort by Discount" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Big Discount");
    await expect
      .poll(() => container.querySelector("tbody tr:last-child")?.textContent)
      .toContain("Plain Game");

    // Ascending: the smallest leads, the row without data still sinks last.
    await page.getByRole("button", { name: "Sort by Discount" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Small Discount");
    await expect
      .poll(() => container.querySelector("tbody tr:last-child")?.textContent)
      .toContain("Plain Game");
  });

  it("renders nothing for the demo dashboard even when an import exists", async () => {
    seed([row({ key: "t1" })]);

    await renderWithAtoms(<PurchaseHistorySection data={demoDashboard} />);

    await expect.element(page.getByText("Your purchase history")).not.toBeInTheDocument();
  });

  it("clicking the Amount paid header re-sorts the rows in both directions", async () => {
    seed([
      row({ key: "cheap", productName: "Cheap Game", amountMinor: 500, date: "2022-01-01" }),
      row({ key: "dear", productName: "Dear Game", amountMinor: 6000, date: "2022-06-01" }),
    ]);

    const { container } = await renderWithAtoms(<PurchaseHistorySection data={realDashboard} />);

    // Default sort is date-descending: the June purchase leads.
    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Dear Game");

    // First click sorts amount descending — the dearest still leads.
    await page.getByRole("button", { name: "Sort by Amount paid" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Dear Game");

    // Second click flips to ascending — the cheapest leads instead.
    await page.getByRole("button", { name: "Sort by Amount paid" }).click();

    await expect
      .poll(() => container.querySelector("tbody tr")?.textContent)
      .toContain("Cheap Game");
  });
});
