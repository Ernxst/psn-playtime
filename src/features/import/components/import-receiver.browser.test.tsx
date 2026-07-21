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
import {
  encodeHandoff,
  flattenApiTransactions,
  HANDOFF_VERSION,
  type HandoffPayload,
  type TransactionRow,
} from "@/domain/transactions";
import { loadHandoff } from "@/routes/import";
import type { DashboardStore } from "@/stores/dashboard-store";
import type { TransactionStore } from "@/stores/transactions-store";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { ImportPending, ImportReceiver, receiveHandoff } from "./import-receiver";

/** Two compact rows (base game + add-on) the bookmarklet would hand off. */
const account = Dashboard.data();
const rows = flattenApiTransactions([Transactions.multiProductPurchase()]);
const accountId = account.profile.accountId;

function payloadOf(transactions: TransactionRow[]): HandoffPayload {
  return {
    v: HANDOFF_VERSION,
    accountId,
    source: "www.playstation.com",
    fetchedAt: "2024-01-01T00:00:00.000Z",
    transactions,
  };
}

function seedPrior(transactions: TransactionRow[]) {
  testTransactionStore.save(accountId, {
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "www.playstation.com",
  });
}

function cleanUp() {
  testTransactionStore.clear(accountId);
  testDashboardStore.remove(accountId);
  window.location.hash = "";
}

function seedAccount() {
  testDashboardStore.save(account);
}

/** Render the real `/import` route (client loader + components) at `/import`. */
function renderImportRoute() {
  const rootRoute = createRootRouteWithContext<{
    dashboardStore: DashboardStore;
    transactionStore: TransactionStore;
  }>()({
    component: () => <Outlet />,
  });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    loader: loadHandoff,
    component: ImportReceiver,
    pendingComponent: ImportPending,
  });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dashboard",
    component: () => <div>dashboard view</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute, dashboardRoute]),
    history: createMemoryHistory({ initialEntries: ["/import"] }),
    context: {
      dashboardStore: testDashboardStore,
      transactionStore: testTransactionStore,
    },
  });

  return render(<RouterProvider router={router} />);
}

describe(".receiveHandoff", () => {
  it("reports the imported count and persists the de-duped rows", () => {
    onTestFinished(cleanUp);
    seedAccount();
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    expect(result).toStrictEqual({ status: "imported", accountId, count: 2 });
    expect(testTransactionStore.load(accountId)?.transactions).toHaveLength(2);
  });

  it("clears the URL fragment after a successful import", () => {
    onTestFinished(cleanUp);
    seedAccount();
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    receiveHandoff(testTransactionStore, testDashboardStore);

    expect(window.location.hash).toBe("");
  });

  it("appends onto a prior import, de-duping by row key", () => {
    onTestFinished(cleanUp);
    seedAccount();
    seedPrior([rows[0]!]);
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    // The prior row repeats and only the second row is appended.
    expect(result).toStrictEqual({ status: "imported", accountId, count: 2 });
    expect(testTransactionStore.load(accountId)?.transactions).toHaveLength(2);
  });

  it("reports an empty handoff and persists nothing when the fragment is absent", () => {
    onTestFinished(cleanUp);
    window.location.hash = "";

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    expect(result).toStrictEqual({ status: "empty" });
    expect(testTransactionStore.load(accountId)).toBeNull();
  });

  it("reports an invalid handoff when the fragment carries no rows", () => {
    onTestFinished(cleanUp);
    seedAccount();
    window.location.hash = `#${encodeHandoff(payloadOf([]))}`;

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    expect(result).toStrictEqual({ status: "invalid" });
  });

  it("reports an empty handoff when the payload fails schema validation", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#data=${encodeURIComponent(JSON.stringify({ v: 99, transactions: "nope" }))}`;

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    expect(result).toStrictEqual({ status: "empty" });
    expect(testTransactionStore.load(accountId)).toBeNull();
  });

  it("rejects a handoff for an account that is not cached", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    const result = receiveHandoff(testTransactionStore, testDashboardStore);

    expect(result).toStrictEqual({ status: "invalid" });
    expect(testTransactionStore.load(accountId)).toBeNull();
  });
});

describe("ImportReceiver", () => {
  it("redirects to the dashboard and toasts after importing the fragment", async () => {
    onTestFinished(cleanUp);
    seedAccount();
    const success = vi.spyOn(toast, "success");
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    await renderImportRoute();

    await expect.element(page.getByText("dashboard view")).toBeVisible();
    expect(testTransactionStore.load(accountId)?.transactions).toHaveLength(2);
    expect(success).toHaveBeenCalledExactlyOnceWith(
      "Imported 2 transactions from your PlayStation history."
    );
  });

  it("shows the empty state when there is no fragment data", async () => {
    onTestFinished(cleanUp);
    window.location.hash = "";

    await renderImportRoute();

    await expect.element(page.getByText("Nothing to import")).toBeVisible();
    await expect.element(page.getByText(/no import data in the link/)).toBeVisible();
  });

  it("shows the invalid state when the fragment carries no rows", async () => {
    onTestFinished(cleanUp);
    seedAccount();
    window.location.hash = `#${encodeHandoff(payloadOf([]))}`;

    await renderImportRoute();

    await expect.element(page.getByText("Nothing to import")).toBeVisible();
    await expect.element(page.getByText(/couldn't read any transactions/)).toBeVisible();
  });
});

describe("ImportPending", () => {
  it("shows the importing spinner while the loader runs", async () => {
    const screen = await render(<ImportPending />);

    await expect.element(screen.getByText("Importing your spend…")).toBeVisible();
  });
});
