import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { TransactionStore } from "@/stores/transactions-store";
import { TestAtomProvider, testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { RemoveTransactions } from "./remove-transactions";

const accountId = Dashboard.data().profile.accountId;

function seedImport() {
  testTransactionStore.save(accountId, {
    transactions: [
      Transactions.row({
        transactionId: "t1",
        key: "t1",
        productName: "Satisfactory",
        amountMinor: 3300,
        displayAmount: "£33.00",
      }),
    ],
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(() => testTransactionStore.clear(accountId));
}

/**
 * Render `RemoveTransactions` at `/` under a router that seeds the root context
 * with the shared {@link testTransactionStore} (so `useRouteContext` resolves it)
 * and wraps the tree in {@link TestAtomProvider} (so `useTransactionImport` reads
 * the same registry the store writes to). Wired locally — the shared harness is
 * untouched.
 */
function renderControl() {
  const rootRoute = createRootRouteWithContext<{
    transactionStore: TransactionStore;
  }>()({
    component: () => (
      <TestAtomProvider>
        <Outlet />
      </TestAtomProvider>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <RemoveTransactions accountId={accountId} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { transactionStore: testTransactionStore },
  });
  return render(<RouterProvider router={router} />);
}

describe("RemoveTransactions", () => {
  it("stays hidden when no transactions are imported", async () => {
    onTestFinished(() => testTransactionStore.clear(accountId));

    await renderControl();

    await expect
      .element(page.getByText("Remove imported transaction data"))
      .not.toBeInTheDocument();
  });

  it("shows the control once transactions are imported", async () => {
    seedImport();

    await renderControl();

    await expect.element(page.getByText("Remove imported transaction data")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Remove" })).toBeVisible();
  });

  it("gates removal behind a two-step confirm and can be cancelled", async () => {
    seedImport();

    await renderControl();

    await page.getByRole("button", { name: "Remove" }).click();

    // The first click only arms the confirm; nothing is cleared yet.
    await expect.element(page.getByRole("button", { name: "Confirm remove" })).toBeVisible();
    expect(testTransactionStore.load(accountId)?.transactions).toHaveLength(1);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect.element(page.getByRole("button", { name: "Remove" })).toBeVisible();
    expect(testTransactionStore.load(accountId)?.transactions).toHaveLength(1);
  });

  it("clears only the import on confirm, leaving dashboard data intact", async () => {
    seedImport();
    const dashboard = Dashboard.data();
    testDashboardStore.save(dashboard);
    onTestFinished(() => testDashboardStore.clearActive());
    const clear = vi.spyOn(testTransactionStore, "clear");
    const success = vi.spyOn(toast, "success");

    await renderControl();

    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Confirm remove" }).click();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(testTransactionStore.load(accountId)).toBeNull();
    expect(success).toHaveBeenCalledExactlyOnceWith("Removed your imported transaction data.");
    // The account's cached games/snapshot are untouched by clearing the import.
    expect(testDashboardStore.load(dashboard.profile.accountId)?.games).toStrictEqual(
      dashboard.games
    );

    // The control hides itself once the import is gone.
    await expect
      .element(page.getByText("Remove imported transaction data"))
      .not.toBeInTheDocument();
  });
});
