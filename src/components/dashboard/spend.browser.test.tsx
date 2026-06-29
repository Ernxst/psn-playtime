import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { bookmarkletHref } from "@/domain/transaction-bookmarklet";
import type { TransactionRow } from "@/domain/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { AddOnsSection, SpendSection, SpentMostSection } from "./spend";

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

function libraryGame(titleId: string, name: string, hours = 1): GamePlay {
  return { titleId, name, platform: "PS5", hours, playCount: 1, genre: "Other", isApp: false };
}

/** An add-on purchase matched to a given library titleId by skuId. */
function addOnFor(titleId: string, n: number): TransactionRow {
  return {
    transactionId: `${titleId}-${n}`,
    key: `${titleId}-${n}`,
    date: "2022-05-12",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: `${titleId} Season Pass`,
    skuId: `EP0001-${titleId}-ADDON${n}-U001`,
    skuType: "ADD_ON",
    quantity: 1,
    amountMinor: 999,
    currency: "£",
    displayAmount: "£9.99",
  };
}

test("shows every game with add-ons, beyond the former cap of ten", async () => {
  const games = Array.from({ length: 12 }, (_, i) =>
    libraryGame(`G${String(i + 1).padStart(2, "0")}`, `Game ${String(i + 1).padStart(2, "0")}`)
  );
  // One add-on each: all tie on count, so ranking falls back to name order, and
  // the eleventh and twelfth titles would be dropped by a `.slice(0, 10)`.
  seed(games.map((g) => addOnFor(g.titleId, 1)));

  await render(<AddOnsSection data={{ ...realDashboard, games }} />);

  await expect.element(page.getByText("Spent extra on")).toBeVisible();
  await expect.element(page.getByText("Game 11")).toBeVisible();
  await expect.element(page.getByText("Game 12")).toBeVisible();
});

/** A base-game purchase matched to a given library titleId by skuId. */
function baseFor(titleId: string, amountMinor: number): TransactionRow {
  return {
    transactionId: `${titleId}-base`,
    key: `${titleId}-base`,
    date: "2022-05-12",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: titleId,
    skuId: `EP0001-${titleId}-00000000000000N1-U001`,
    skuType: "STANDARD",
    quantity: 1,
    amountMinor,
    currency: "£",
    displayAmount: "",
  };
}

test("ranks games by total spend, summing base game and add-ons", async () => {
  const cyberpunk = libraryGame("CYBER", "Cyberpunk 2077", 40);
  seed([
    baseFor("CYBER", 1999),
    addOnFor("CYBER", 1), // 999 add-on → £29.98 total
  ]);

  await render(<SpentMostSection data={{ ...realDashboard, games: [cyberpunk] }} />);

  await expect.element(page.getByText("Spent the most on")).toBeVisible();
  await expect.element(page.getByText("Cyberpunk 2077")).toBeVisible();
  await expect.element(page.getByText("£29.98")).toBeVisible();
});

test("hides the spent-most section for the demo dashboard", async () => {
  seed([baseFor("DEMO-8", 1999)]);

  await render(<SpentMostSection data={demoDashboard} />);

  await expect.element(page.getByText("Spent the most on")).not.toBeInTheDocument();
});

test("hides the spent-most section when no transactions are imported", async () => {
  onTestFinished(clearTransactionImport);

  await render(<SpentMostSection data={realDashboard} />);

  await expect.element(page.getByText("Spent the most on")).not.toBeInTheDocument();
});
