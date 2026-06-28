import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import type { TransactionRow } from "@/lib/psn/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
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

// Give the chart surfaces a real size so Recharts renders inside the compose.
beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>[data-slot="chart"]{width:360px;height:300px}</style>`
  );
});

test("composes the header, KPIs, chart sections and games table from the data", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
  await expect.element(page.getByText("Games played")).toBeVisible();
  await expect.element(page.getByText("Top games by hours")).toBeVisible();
  await expect.element(page.getByText("Every game you've played")).toBeVisible();
});

test("shows the demo banner for the demo dataset and offers no sign-out", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByText("demo dataset")).toBeVisible();
  expect(page.getByRole("button", { name: "Sign out" }).query()).toBeNull();
});

test("a signed-in dataset drops the demo banner and wires the sign-out button", async () => {
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

test("choosing a timeframe recomputes the scoped library", async () => {
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

test("narrowing the library narrows the AI prompt", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

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

test("keeps account-wide spend totals when a filter narrows the library", async () => {
  // A real, signed-in account: spend joins to the library and is account-wide.
  saveTransactionImport({
    transactions: [baseFor("DEMO-8", 3000), baseFor("DEMO-6", 2000)],
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(clearTransactionImport);

  const { element } = createHarness(
    <DashboardView
      data={{ ...demoDashboard, isDemo: false }}
      onSignOut={vi.fn()}
      signingOut={false}
    />
  );

  const { container } = await render(element);

  // The "Spent the most on" section is account-wide; scope spend reads to it.
  const spentMost = () => container.querySelector("#spent-most")?.textContent ?? "";

  await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

  // Satisfactory's £20 spend (DEMO-6) shows alongside the full library.
  expect(spentMost()).toContain("Satisfactory");
  expect(spentMost()).toContain("£20.00");

  // Filtering to Cyberpunk (DEMO-8) narrows the game-centric views off Satisfactory.
  await page.getByRole("searchbox", { name: "Search games by name" }).fill("Cyberpunk");

  await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

  // …but spend stays account-wide: Satisfactory's £20 is still reported.
  expect(spentMost()).toContain("Satisfactory");
  expect(spentMost()).toContain("£20.00");
});

test("renders the empty state when the account has no played games", async () => {
  const { element } = createHarness(
    <DashboardView data={{ ...demoDashboard, games: [] }} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByText("No games yet")).toBeVisible();
});

test("shows the no-matches state and restores the library when filters are cleared", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await page.getByRole("searchbox", { name: "Search games by name" }).fill("zzzzzznomatch");

  await expect.element(page.getByText("No games match your filters")).toBeVisible();

  await page.getByRole("button", { name: "Clear all filters" }).click();

  await expect.element(page.getByText(/98 titles in total/)).toBeVisible();
});

test("searching by name narrows the scoped library", async () => {
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
