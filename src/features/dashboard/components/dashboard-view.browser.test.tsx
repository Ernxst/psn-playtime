import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import { testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { DashboardView } from "./dashboard-view";

/** A base-game purchase matched to a demo library titleId by skuId. */
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

describe("DashboardView", () => {
  it("composes the profile, supporting evidence, game table and tools in DOM order", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Your play profile" })).toBeVisible();

    // Reveal the deferred chart section so its IntersectionObserver fires and loads the chart.
    document.getElementById("top-games")?.scrollIntoView();

    await expect.element(page.getByText("Recorded hours")).toBeVisible();
    await expect.element(page.getByText("Every game you've played")).toBeVisible();

    const headings = [...document.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings).toEqual([
      "At a glance",
      "Your play profile",
      "Top games",
      "All games",
      "Tools",
    ]);
  });

  it("removes weak proxy and recommendation surfaces from the main flow", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await expect
      .element(
        page.getByText(
          /Binge or dip-in|Hours by most-recent year|Kept coming back to|Still in rotation|Platinum within reach|Best value per hour/
        )
      )
      .not.toBeInTheDocument();
  });

  it("shows the demo banner for the demo dataset and offers no sign-out", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await expect.element(page.getByText("demo dataset")).toBeVisible();
    expect(page.getByRole("button", { name: "Sign out" }).query()).toBeNull();
  });

  it("a signed-in dataset drops the demo banner and wires the sign-out button", async () => {
    const onSignOut = vi.fn();
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, isDemo: false }}
        onSignOut={onSignOut}
        signingOut={false}
      />
    );

    await render(element);

    expect(page.getByText("demo dataset").query()).toBeNull();

    await page.getByRole("button", { name: "Sign out" }).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("choosing a timeframe recomputes the scoped library", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    // The games-table caption echoes the scoped title count — a stable recompute signal.
    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    await page.getByRole("tab", { name: "This year" }).click();

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
  });

  it("narrowing the library narrows the AI prompt", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await page.getByText("Tools", { exact: true }).click();
    await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();

    const countGames = () =>
      (document.querySelector<HTMLTextAreaElement>('[aria-label="Prompt preview"]')?.value ?? "")
        .split("\n")
        .filter((line) => /^ {2}\d+\. /.test(line)).length;

    const fullCount = countGames();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

    expect(fullCount).toBe(demoDashboard.games.length);
    expect(countGames()).toBeLessThan(fullCount);
  });

  it("keeps account-wide spend totals when a filter narrows the library", async () => {
    // A real, signed-in account: spend joins to the library and is account-wide.
    testTransactionStore.save({
      transactions: [baseFor("DEMO-8", 3000), baseFor("DEMO-6", 2000)],
      importedAt: "2024-01-01T00:00:00.000Z",
      source: "store.playstation.com",
    });
    onTestFinished(() => testTransactionStore.clear());

    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, isDemo: false }}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    const { container } = await render(element);
    const spend = () => container.querySelector("#spend")?.textContent ?? "";

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    expect(spend()).toContain("£50.00");

    // Filtering to Cyberpunk (DEMO-8) narrows the game-centric views off Satisfactory.
    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Cyberpunk");

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

    expect(spend()).toContain("£50.00");
  });

  it("keeps spend setup and AI utilities collapsed after all games when no spend exists", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await expect
      .element(page.getByRole("heading", { name: "Spend evidence" }))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("Add your spend")).not.toBeVisible();

    await page.getByText("Tools", { exact: true }).click();

    await expect.element(page.getByText("Add your spend")).toBeVisible();
    await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();
  });

  it("renders the empty state when the account has no played games", async () => {
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, games: [] }}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("No games yet")).toBeVisible();
  });

  it("shows the no-matches state and restores the library when filters are cleared", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("zzzzzznomatch");

    await expect.element(page.getByText("No games match your filters")).toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();
  });

  it("keeps the search input responsive while the deferred filter settles", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    const searchbox = page.getByRole("searchbox", { name: "Search games by name" });
    await searchbox.fill("Forza");

    // The input reflects the typed term immediately (it stays bound to the live filters)…
    await expect.element(searchbox).toHaveValue("Forza");

    // …and the deferred re-filter eventually settles the scoped library to the matches.
    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
  });

  it("searching by name narrows the scoped library", async () => {
    const { element } = createHarness(
      <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    // Recompute drops the total to just the Forza matches.
    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
  });
});
