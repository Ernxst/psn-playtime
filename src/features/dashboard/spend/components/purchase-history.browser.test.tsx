import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionRow } from "@/domain/transactions";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { PurchaseHistorySection } from "./purchase-history";

function seed(transactions: TransactionRow[]) {
  testTransactionStore.save(
    Dashboard.data().profile.accountId,
    Transactions.importRecord({ transactions })
  );
  onTestFinished(() => testTransactionStore.clear(Dashboard.data().profile.accountId));
}

describe("PurchaseHistorySection", () => {
  it("lists imported transactions with product, amount and type", async () => {
    seed([
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        key: "t1",
        productName: "Hollow Knight",
        amountMinor: 1099,
        currency: "£",
      }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data({ isDemo: false })} />, {
      wrapper: TestAtomProvider,
    });

    await expect.element(page.getByText("Your purchase history")).toBeVisible();
    await expect.element(page.getByText("Hollow Knight")).toBeVisible();
    await expect.element(page.getByText("£10.99")).toBeVisible();
    await expect.element(page.getByText("Purchase", { exact: true })).toBeVisible();
  });

  it("shows the original price and discount in their own columns when present", async () => {
    seed([
      Transactions.row({
        key: "t1",
        productName: "Elden Ring",
        amountMinor: 4000,
        originalPriceMinor: 5000,
        discountMinor: 1000,
      }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data({ isDemo: false })} />, {
      wrapper: TestAtomProvider,
    });

    await expect.element(page.getByRole("button", { name: "Sort by Original" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sort by Discount" })).toBeVisible();
    await expect.element(page.getByText("£50.00")).toBeVisible();
    await expect.element(page.getByText("−£10.00")).toBeVisible();
  });

  it("clicking the Original header re-sorts the rows and sinks rows without an original price", async () => {
    seed([
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        key: "plain",
        productName: "Plain Game",
        date: "2022-06-01",
      }),
      Transactions.row({
        discountMinor: undefined,
        key: "low",
        productName: "Low Original",
        date: "2022-02-01",
        originalPriceMinor: 2000,
      }),
      Transactions.row({
        discountMinor: undefined,
        key: "high",
        productName: "High Original",
        date: "2022-01-01",
        originalPriceMinor: 9000,
      }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data({ isDemo: false })} />, {
      wrapper: TestAtomProvider,
    });
    const firstRowText = () => page.getByRole("row").nth(1).element().textContent;
    const lastRowText = () => page.getByRole("row").last().element().textContent;

    // Descending by original price: the highest leads, the row without data sinks last.
    await page.getByRole("button", { name: "Sort by Original" }).click();

    await expect.poll(firstRowText).toContain("High Original");
    await expect.poll(lastRowText).toContain("Plain Game");

    // Ascending: the lowest leads, the row without data still sinks last.
    await page.getByRole("button", { name: "Sort by Original" }).click();

    await expect.poll(firstRowText).toContain("Low Original");
    await expect.poll(lastRowText).toContain("Plain Game");
  });

  it("clicking the Discount header re-sorts the rows and sinks rows without a discount", async () => {
    seed([
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        key: "plain",
        productName: "Plain Game",
        date: "2022-06-01",
      }),
      Transactions.row({
        originalPriceMinor: undefined,
        key: "small",
        productName: "Small Discount",
        date: "2022-02-01",
        discountMinor: 500,
      }),
      Transactions.row({
        originalPriceMinor: undefined,
        key: "big",
        productName: "Big Discount",
        date: "2022-01-01",
        discountMinor: 4000,
      }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data({ isDemo: false })} />, {
      wrapper: TestAtomProvider,
    });
    const firstRowText = () => page.getByRole("row").nth(1).element().textContent;
    const lastRowText = () => page.getByRole("row").last().element().textContent;

    // Descending by discount: the largest leads, the row without data sinks last.
    await page.getByRole("button", { name: "Sort by Discount" }).click();

    await expect.poll(firstRowText).toContain("Big Discount");
    await expect.poll(lastRowText).toContain("Plain Game");

    // Ascending: the smallest leads, the row without data still sinks last.
    await page.getByRole("button", { name: "Sort by Discount" }).click();

    await expect.poll(firstRowText).toContain("Small Discount");
    await expect.poll(lastRowText).toContain("Plain Game");
  });

  it("renders nothing for the demo dashboard even when an import exists", async () => {
    seed([
      Transactions.row({ originalPriceMinor: undefined, discountMinor: undefined, key: "t1" }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data()} />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("Your purchase history")).not.toBeInTheDocument();
  });

  it("clicking the Amount paid header re-sorts the rows in both directions", async () => {
    seed([
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        key: "cheap",
        productName: "Cheap Game",
        amountMinor: 500,
        date: "2022-01-01",
      }),
      Transactions.row({
        originalPriceMinor: undefined,
        discountMinor: undefined,
        key: "dear",
        productName: "Dear Game",
        amountMinor: 6000,
        date: "2022-06-01",
      }),
    ]);

    await render(<PurchaseHistorySection data={Dashboard.data({ isDemo: false })} />, {
      wrapper: TestAtomProvider,
    });
    const firstRowText = () => page.getByRole("row").nth(1).element().textContent;

    // Default sort is date-descending: the June purchase leads.
    await expect.poll(firstRowText).toContain("Dear Game");

    // First click sorts amount descending — the dearest still leads.
    await page.getByRole("button", { name: "Sort by Amount paid" }).click();

    await expect.poll(firstRowText).toContain("Dear Game");

    // Second click flips to ascending — the cheapest leads instead.
    await page.getByRole("button", { name: "Sort by Amount paid" }).click();

    await expect.poll(firstRowText).toContain("Cheap Game");
  });
});
