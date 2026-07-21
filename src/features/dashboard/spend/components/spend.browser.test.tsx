import type { ReactNode } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { bookmarkletHref } from "@/domain/transaction-bookmarklet";
import type { TransactionRow } from "@/domain/transactions";
import type { GamePlay } from "@/server/providers/account/snapshot";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import { AddOnsSection, SpendSection, SpentMostSection } from "./spend";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render under the atom provider so `useTransactionImport` shares the registry that imperative writes target. */
function renderWithAtoms(ui: ReactNode) {
  return render(ui, { wrapper: TestAtomProvider });
}

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
  testTransactionStore.save(demoDashboard.profile.accountId, {
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
}

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

describe("SpendSection", () => {
  it("prompts for an import when no transactions are present", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    await expect.element(page.getByText("Add your spend")).toBeVisible();
    // Scope to the affordance link: the fine-pointer drag step also names the
    // button in a `<strong>`, so a bare text match resolves to two elements.
    await expect
      .element(page.getByRole("link", { name: "Import PSN spend", includeHidden: true }))
      .toBeVisible();
  });

  it("walks coarse pointer users through bookmarking and editing the URL", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
    mockPointer(true);

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    await expect
      .element(
        page.getByText(
          "Edit that bookmark — give it a short name you'll remember, clear out the URL, paste the copied bookmarklet, and save."
        )
      )
      .toBeVisible();
  });

  it("splits the mobile run step into labelled Safari and Chrome sub-steps", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
    mockPointer(true);

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    // Parent run line plus both platform labels, each emphasised.
    await expect.element(page.getByText("Run it on the PlayStation tab:")).toBeVisible();
    expect(page.getByText("iPhone/iPad (Safari)", { exact: false }).element().tagName).toBe(
      "STRONG"
    );
    expect(page.getByText("Android (Chrome)", { exact: false }).element().tagName).toBe("STRONG");

    // Safari: tap the saved bookmark in the Bookmarks list and it runs.
    await expect
      .element(
        page.getByText("open your Bookmarks and tap the one you saved — it runs on this page.")
      )
      .toBeVisible();

    // Chrome: type the name and tap the suggestion, with "don't press Enter" emphasised.
    const dontPressEnter = page.getByText("don't press Enter");

    await expect.element(dontPressEnter).toBeVisible();
    expect(dontPressEnter.element().tagName).toBe("STRONG");
  });

  it("explains why an import step is needed when the info control is activated", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    const info = page.getByRole("button", { name: "Why an import step is needed" });

    await expect.element(info).toBeVisible();
    // The explanation is disclosed on activation, not shown up front.
    await expect
      .element(
        page.getByText("it can only be read from a page you're signed into", { exact: false })
      )
      .not.toBeInTheDocument();

    await info.click();

    await expect
      .element(
        page.getByText("it can only be read from a page you're signed into", { exact: false })
      )
      .toBeVisible();
  });

  it("tells fine pointer users they can drag the bookmarklet", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
    mockPointer(false);

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    await expect
      .element(
        page.getByText(
          "Drag the Import PSN spend button below onto your bookmarks bar (or copy it and make a new bookmark)."
        )
      )
      .toBeVisible();
  });

  it("copies the bookmarklet and flashes confirmation when Copy is clicked", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    await page.getByRole("button", { name: "Copy bookmarklet" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      bookmarkletHref(
        window.location.origin,
        demoDashboard.profile.accountId,
        demoDashboard.profile.onlineId
      )
    );
    await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("keeps the drag affordance out of the tab order and accessibility tree", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    // The drag step also names the button in a `<strong>`, so scope to the
    // aria-hidden affordance link (`includeHidden` reaches it; a strong is not a
    // link) rather than a bare text match, which now resolves to two elements.
    const affordance = page.getByRole("link", { name: "Import PSN spend", includeHidden: true });

    await expect.element(affordance).toHaveAttribute("aria-hidden", "true");
    await expect.element(affordance).toHaveAttribute("tabindex", "-1");
    await expect
      .element(page.getByRole("link", { name: "Import PSN spend" }))
      .not.toBeInTheDocument();
  });

  it("links to PlayStation order history in the import instructions", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    const link = page.getByRole("link", { name: "Open PlayStation" });

    await expect.element(link).toHaveAttribute("href", "https://www.playstation.com/en-gb/");
    await expect.element(link).toHaveAttribute("target", "_blank");
    await expect.element(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows the value leaderboard once transactions are imported", async () => {
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

    await renderWithAtoms(<SpendSection data={realDashboard} />);

    await expect.element(page.getByText("Best value per hour")).toBeVisible();
    await expect.element(page.getByText("What you've spent")).toBeVisible();
    await expect.element(page.getByText("Satisfactory")).toBeVisible();
  });

  it("offers a re-import affordance with the install instructions once imported", async () => {
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

    await renderWithAtoms(<SpendSection data={realDashboard} />);

    const summary = page.getByText("Re-import or update your data");
    // A chevron affordance signals the section is expandable and is wired to rotate when open.
    // The contract is the icon's rotation class, not a user-addressable element.
    // oxlint-disable-next-line test-contract/no-dom-selector
    const chevron = summary.element().querySelector("svg.lucide-chevron-down");

    expect(chevron).toHaveClass("group-open:rotate-180");

    await summary.click();

    await expect.element(page.getByRole("button", { name: "Copy bookmarklet" })).toBeVisible();
  });

  it("prompts a non-demo account to import when no transactions are present", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpendSection data={realDashboard} />);

    await expect.element(page.getByText("Add your spend")).toBeVisible();
    await expect.element(page.getByText("What you've spent")).not.toBeInTheDocument();
  });

  it("surfaces spend that matched no played title in the leaderboard footer", async () => {
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
      {
        transactionId: "t2",
        key: "t2",
        date: "2022-06-12",
        transactionType: "PRODUCT_PURCHASE",
        kind: "purchase",
        productName: "Nonexistent Phantom Title",
        quantity: 1,
        amountMinor: 500,
        currency: "£",
        displayAmount: "£5.00",
      },
    ]);

    await renderWithAtoms(<SpendSection data={realDashboard} />);

    await expect.element(page.getByText("Best value per hour")).toBeVisible();
    await expect.element(page.getByText("Spend not matched to a played title")).toBeVisible();
    await expect.element(page.getByText("£5.00")).toBeVisible();
  });

  it("shows the import prompt on the demo dashboard even when an import exists", async () => {
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

    await renderWithAtoms(<SpendSection data={demoDashboard} />);

    await expect.element(page.getByText("Add your spend")).toBeVisible();
    await expect.element(page.getByText("Best value per hour")).not.toBeInTheDocument();
  });
});

describe("AddOnsSection", () => {
  it("ranks games by how many add-ons were bought once transactions are imported", async () => {
    seed([addOn("a1"), addOn("a2")]);

    await renderWithAtoms(<AddOnsSection data={realDashboard} />);

    await expect.element(page.getByText("Spent extra on")).toBeVisible();
    await expect.element(page.getByText("FIFA 18")).toBeVisible();
    await expect.element(page.getByText("2 add-ons")).toBeVisible();
  });

  it("hides the add-ons section for the demo dashboard", async () => {
    seed([addOn("a1")]);

    await renderWithAtoms(<AddOnsSection data={demoDashboard} />);

    await expect.element(page.getByText("Spent extra on")).not.toBeInTheDocument();
  });

  it("hides the add-ons section when no transactions are imported", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<AddOnsSection data={realDashboard} />);

    await expect.element(page.getByText("Spent extra on")).not.toBeInTheDocument();
  });

  it("shows every game with add-ons, beyond the former cap of ten", async () => {
    const games = Array.from({ length: 12 }, (_, i) =>
      libraryGame(`G${String(i + 1).padStart(2, "0")}`, `Game ${String(i + 1).padStart(2, "0")}`)
    );
    // One add-on each: all tie on count, so ranking falls back to name order, and
    // the eleventh and twelfth titles would be dropped by a `.slice(0, 10)`.
    seed(games.map((g) => addOnFor(g.titleId, 1)));

    await renderWithAtoms(<AddOnsSection data={{ ...realDashboard, games }} />);

    await expect.element(page.getByText("Spent extra on")).toBeVisible();
    await expect.element(page.getByText("Game 11")).toBeVisible();
    await expect.element(page.getByText("Game 12")).toBeVisible();
  });
});

describe("SpentMostSection", () => {
  it("ranks games by total spend, summing base game and add-ons", async () => {
    const cyberpunk = libraryGame("CYBER", "Cyberpunk 2077", 40);
    seed([
      baseFor("CYBER", 1999),
      addOnFor("CYBER", 1), // 999 add-on → £29.98 total
    ]);

    await renderWithAtoms(<SpentMostSection data={{ ...realDashboard, games: [cyberpunk] }} />);

    await expect.element(page.getByText("Spent the most on")).toBeVisible();
    await expect.element(page.getByText("Cyberpunk 2077")).toBeVisible();
    await expect.element(page.getByText("£29.98")).toBeVisible();
  });

  it("hides the spent-most section for the demo dashboard", async () => {
    seed([baseFor("DEMO-8", 1999)]);

    await renderWithAtoms(<SpentMostSection data={demoDashboard} />);

    await expect.element(page.getByText("Spent the most on")).not.toBeInTheDocument();
  });

  it("hides the spent-most section when no transactions are imported", async () => {
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    await renderWithAtoms(<SpentMostSection data={realDashboard} />);

    await expect.element(page.getByText("Spent the most on")).not.toBeInTheDocument();
  });
});
