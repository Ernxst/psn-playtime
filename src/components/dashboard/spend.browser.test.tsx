import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import type { TransactionRow } from "@/lib/psn/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
import { SpendSection } from "./spend";

/** The demo library as it would arrive for a real, signed-in account. */
const realDashboard = { ...demoDashboard, isDemo: false };

function mockPointer(coarse: boolean) {
  const original = window.matchMedia;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query === "(pointer: coarse)" ? coarse : original.call(window, query).matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => true,
      removeEventListener: () => {},
      removeListener: () => {},
    }) satisfies MediaQueryList;
  onTestFinished(() => {
    window.matchMedia = original;
  });
}

function seed(transactions: TransactionRow[]) {
  saveTransactionImport({
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(clearTransactionImport);
}

test("prompts for an import when no transactions are present", async () => {
  onTestFinished(clearTransactionImport);

  await render(<SpendSection data={demoDashboard} />);

  await expect.element(page.getByText("Add your spend")).toBeVisible();
  await expect.element(page.getByText("Import PSN spend")).toBeVisible();
});

test("tells coarse pointer users to copy the bookmark", async () => {
  onTestFinished(clearTransactionImport);
  mockPointer(true);

  await render(<SpendSection data={demoDashboard} />);

  await expect
    .element(page.getByText("Click Copy bookmark and save it as a new bookmark."))
    .toBeVisible();
});

test("tells fine pointer users they can drag the bookmarklet", async () => {
  onTestFinished(clearTransactionImport);
  mockPointer(false);

  await render(<SpendSection data={demoDashboard} />);

  await expect
    .element(
      page.getByText(
        "Drag the button below onto your bookmarks bar (or copy it and make a new bookmark)."
      )
    )
    .toBeVisible();
});

test("links to PlayStation order history in the import instructions", async () => {
  onTestFinished(clearTransactionImport);

  await render(<SpendSection data={demoDashboard} />);

  const link = page.getByRole("link", { name: "Open PlayStation" });

  await expect.element(link).toHaveAttribute("href", "https://www.playstation.com/en-gb/");
  await expect.element(link).toHaveAttribute("target", "_blank");
  await expect.element(link).toHaveAttribute("rel", "noreferrer");
});

test("shows the value leaderboard once transactions are imported", async () => {
  seed([
    {
      transactionId: "t1",
      key: "t1",
      date: "2022-05-12",
      transactionType: "PRODUCT_PURCHASE",
      kind: "purchase",
      productName: "Satisfactory",
      quantity: 1,
      amountMinor: 3300,
      currency: "£",
      displayAmount: "£33.00",
    },
  ]);

  await render(<SpendSection data={realDashboard} />);

  await expect.element(page.getByText("Best value per hour")).toBeVisible();
  await expect.element(page.getByText("What you've spent")).toBeVisible();
  await expect.element(page.getByText("Satisfactory")).toBeVisible();
});

test("shows the import prompt on the demo dashboard even when an import exists", async () => {
  seed([
    {
      transactionId: "t1",
      key: "t1",
      date: "2022-05-12",
      transactionType: "PRODUCT_PURCHASE",
      kind: "purchase",
      productName: "Satisfactory",
      quantity: 1,
      amountMinor: 3300,
      currency: "£",
      displayAmount: "£33.00",
    },
  ]);

  await render(<SpendSection data={demoDashboard} />);

  await expect.element(page.getByText("Add your spend")).toBeVisible();
  await expect.element(page.getByText("Best value per hour")).not.toBeInTheDocument();
});
