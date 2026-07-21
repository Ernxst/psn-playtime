import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { createHarness } from "@/test/harness";
import { DashboardView } from "./dashboard-view";

function textareaValue(element: Element): string {
  if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected a textarea");
  return element.value;
}

function gamesCaption(count: number) {
  return `Tap a column to sort. ${count} titles in total. Hours are what PSN recorded for each game and can under-report real play time.`;
}

/** A base-game purchase matched to a demo library titleId by skuId. */
function baseFor(titleId: string, amountMinor: number) {
  return Transactions.row({
    transactionId: `${titleId}-base`,
    key: `${titleId}-base`,
    date: "2022-05-12",
    productName: titleId,
    skuId: `EP0001-${titleId}-00000000000000N1-U001`,
    amountMinor,
    displayAmount: "",
  });
}

describe("DashboardView", () => {
  it("composes the header, KPIs, chart sections and games table from the data", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
    await expect.element(page.getByText("Games played")).toBeVisible();

    // Reveal the deferred chart section so its IntersectionObserver fires and loads the chart.
    // The section itself is deliberately not rendered through an accessible locator yet.
    // oxlint-disable-next-line test-contract/no-dom-selector
    document.getElementById("top-games")?.scrollIntoView();

    await expect.element(page.getByText("Top games by hours")).toBeVisible();
    await expect.element(page.getByText("Every game you've played")).toBeVisible();
  });

  it("shows the demo banner for the demo dataset and offers no sign-out", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("demo dataset")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("a signed-in dataset drops the demo banner and wires the sign-out button", async () => {
    const onSignOut = vi.fn();
    const { element } = createHarness(
      <DashboardView
        data={{ ...Dashboard.data(), isDemo: false }}
        onRefresh={vi.fn()}
        onSignOut={onSignOut}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("demo dataset")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Sign out" }).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("choosing a timeframe recomputes the scoped library", async () => {
    const dashboard = Dashboard.data();
    const currentYear = new Date().getUTCFullYear();
    const data = Dashboard.data({
      games: dashboard.games.slice(0, 2).map((game, index) => ({
        ...game,
        lastPlayed: `${index === 0 ? currentYear : currentYear - 1}-06-01`,
      })),
      meta: { ...dashboard.meta, totalGames: 2 },
    });
    const { element } = createHarness(
      <DashboardView data={data} onRefresh={vi.fn()} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    // The games-table caption echoes the scoped title count — a stable recompute signal.
    await expect.element(page.getByText(gamesCaption(2), { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "This year" }).click();

    await expect.element(page.getByText(gamesCaption(1), { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("table").getByText(data.games[0]?.name ?? "", { exact: true }))
      .toBeVisible();
  });

  it("narrowing the library narrows the AI prompt", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();

    const countGames = () =>
      textareaValue(page.getByRole("textbox", { name: "Prompt preview" }).element())
        .split("\n")
        .filter((line) => /^ {2}\d+\. /.test(line)).length;

    const fullCount = countGames();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    await expect.element(page.getByText(gamesCaption(1), { exact: true })).toBeVisible();

    expect(fullCount).toBe(Dashboard.data().games.length);
    expect(countGames()).toBe(1);
  });

  it("keeps account-wide spend totals when a filter narrows the library", async () => {
    // A real, signed-in account: spend joins to the library and is account-wide.
    testTransactionStore.save(Dashboard.data().profile.accountId, {
      transactions: [baseFor("DEMO-8", 3000), baseFor("DEMO-6", 2000)],
      importedAt: "2024-01-01T00:00:00.000Z",
      source: "store.playstation.com",
    });
    onTestFinished(() => testTransactionStore.clear(Dashboard.data().profile.accountId));

    const { element } = createHarness(
      <DashboardView
        data={{ ...Dashboard.data(), isDemo: false }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    // The "Spent the most on" section is account-wide; scope spend reads to it.
    const spentMost = () =>
      // The section has no accessible name; the contract here is its structural scope.
      // oxlint-disable-next-line test-contract/no-dom-selector
      page.getByText("Spent the most on").element().closest("section")?.textContent ?? "";

    await expect.element(page.getByText(gamesCaption(98), { exact: true })).toBeVisible();

    // Satisfactory's £20 spend (DEMO-6) shows alongside the full library.
    expect(spentMost()).toContain("Satisfactory");
    expect(spentMost()).toContain("£20.00");

    // Filtering to Cyberpunk (DEMO-8) narrows the game-centric views off Satisfactory.
    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Cyberpunk");

    await expect.element(page.getByText(gamesCaption(1), { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("table").getByText("Cyberpunk 2077", { exact: true }))
      .toBeVisible();

    // …but spend stays account-wide: Satisfactory's £20 is still reported.
    expect(spentMost()).toContain("Satisfactory");
    expect(spentMost()).toContain("£20.00");
  });

  it("renders the empty state when the account has no played games", async () => {
    const { element } = createHarness(
      <DashboardView
        data={{ ...Dashboard.data(), games: [] }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("No games yet")).toBeVisible();
  });

  it("shows the no-matches state and restores the library when filters are cleared", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("zzzzzznomatch");

    await expect.element(page.getByText("No games match your filters")).toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect.element(page.getByText(gamesCaption(98), { exact: true })).toBeVisible();
  });

  it("keeps the search input responsive while the deferred filter settles", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const searchbox = page.getByRole("searchbox", {
      name: "Search games by name",
    });
    await searchbox.fill("Forza");

    // The input reflects the typed term immediately (it stays bound to the live filters)…
    await expect.element(searchbox).toHaveValue("Forza");

    // …and the deferred re-filter eventually settles the scoped library to the match.
    await expect.element(page.getByText(gamesCaption(1), { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("table").getByText("Forza Horizon 5", { exact: true }))
      .toBeVisible();
  });

  it("searching by name narrows the scoped library", async () => {
    const { element } = createHarness(
      <DashboardView
        data={Dashboard.data()}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText(gamesCaption(98), { exact: true })).toBeVisible();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    await expect.element(page.getByText(gamesCaption(1), { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("table").getByText("Forza Horizon 5", { exact: true }))
      .toBeVisible();
  });
});
