import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { bookmarkletHref } from "@/lib/psn/transaction-bookmarklet";
import type { TransactionRow } from "@/lib/psn/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
import { AddOnsSection, SpendSection } from "./spend";

afterEach(() => {
  vi.restoreAllMocks();
});

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

test("copies the bookmarklet and flashes confirmation when Copy is clicked", async () => {
  onTestFinished(clearTransactionImport);
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

  await render(<SpendSection data={demoDashboard} />);

  await page.getByRole("button", { name: "Copy bookmarklet" }).click();

  expect(writeText).toHaveBeenCalledExactlyOnceWith(bookmarkletHref(window.location.origin));
  await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();
});

test("keeps the drag affordance out of the tab order and accessibility tree", async () => {
  onTestFinished(clearTransactionImport);

  await render(<SpendSection data={demoDashboard} />);

  const affordance = page.getByText("Import PSN spend");

  await expect.element(affordance).toHaveAttribute("aria-hidden", "true");
  await expect.element(affordance).toHaveAttribute("tabindex", "-1");
  await expect
    .element(page.getByRole("link", { name: "Import PSN spend" }))
    .not.toBeInTheDocument();
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

/** An add-on purchase matched to "FIFA 18" (titleId DEMO-1) in the demo library. */
function addOn(transactionId: string): TransactionRow {
  return {
    transactionId,
    key: transactionId,
    date: "2022-05-12",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "FIFA 18 Ultimate Team Points Pack",
    skuId: `EP0001-DEMO-1-ADDON${transactionId}-U001`,
    skuType: "ADD_ON",
    quantity: 1,
    amountMinor: 999,
    currency: "£",
    displayAmount: "£9.99",
  };
}

test("ranks games by how many add-ons were bought once transactions are imported", async () => {
  seed([addOn("a1"), addOn("a2")]);

  await render(<AddOnsSection data={realDashboard} />);

  await expect.element(page.getByText("Spent extra on")).toBeVisible();
  await expect.element(page.getByText("FIFA 18")).toBeVisible();
  await expect.element(page.getByText("2 add-ons")).toBeVisible();
});

test("hides the add-ons section for the demo dashboard", async () => {
  seed([addOn("a1")]);

  await render(<AddOnsSection data={demoDashboard} />);

  await expect.element(page.getByText("Spent extra on")).not.toBeInTheDocument();
});

test("hides the add-ons section when no transactions are imported", async () => {
  onTestFinished(clearTransactionImport);

  await render(<AddOnsSection data={realDashboard} />);

  await expect.element(page.getByText("Spent extra on")).not.toBeInTheDocument();
});
