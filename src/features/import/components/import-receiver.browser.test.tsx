import {
  createMemoryHistory,
  createRootRoute,
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
import {
  clearTransactionImport,
  loadTransactionImport,
  saveTransactionImport,
} from "@/stores/transactions-store";
import { multiProductPurchase } from "@/test/transaction-fixtures";
import { ImportPending, ImportReceiver, receiveHandoff } from "./import-receiver";

/** Two compact rows (base game + add-on) the bookmarklet would hand off. */
const rows = flattenApiTransactions([multiProductPurchase]);

function payloadOf(transactions: TransactionRow[]): HandoffPayload {
  return {
    v: HANDOFF_VERSION,
    source: "www.playstation.com",
    fetchedAt: "2024-01-01T00:00:00.000Z",
    transactions,
  };
}

function seedPrior(transactions: TransactionRow[]) {
  saveTransactionImport({
    transactions,
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "www.playstation.com",
  });
}

function cleanUp() {
  clearTransactionImport();
  window.location.hash = "";
}

/** Render the real `/import` route (client loader + components) at `/import`. */
function renderImportRoute() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
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
  });

  return render(<RouterProvider router={router} />);
}

describe(".receiveHandoff", () => {
  it("reports the imported count and persists the de-duped rows", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    const result = receiveHandoff();

    expect(result).toEqual({ status: "imported", count: 2 });
    expect(loadTransactionImport()?.transactions).toHaveLength(2);
  });

  it("clears the URL fragment after a successful import", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    receiveHandoff();

    expect(window.location.hash).toBe("");
  });

  it("appends onto a prior import, de-duping by row key", () => {
    onTestFinished(cleanUp);
    seedPrior([rows[0]!]);
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    const result = receiveHandoff();

    // The prior row repeats and only the second row is appended.
    expect(result).toEqual({ status: "imported", count: 2 });
    expect(loadTransactionImport()?.transactions).toHaveLength(2);
  });

  it("reports an empty handoff and persists nothing when the fragment is absent", () => {
    onTestFinished(cleanUp);
    window.location.hash = "";

    const result = receiveHandoff();

    expect(result).toEqual({ status: "empty" });
    expect(loadTransactionImport()).toBeNull();
  });

  it("reports an invalid handoff when the fragment carries no rows", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#${encodeHandoff(payloadOf([]))}`;

    const result = receiveHandoff();

    expect(result).toEqual({ status: "invalid" });
  });

  it("reports an empty handoff when the payload fails schema validation", () => {
    onTestFinished(cleanUp);
    window.location.hash = `#data=${encodeURIComponent(JSON.stringify({ v: 99, transactions: "nope" }))}`;

    const result = receiveHandoff();

    expect(result).toEqual({ status: "empty" });
    expect(loadTransactionImport()).toBeNull();
  });
});

describe("ImportReceiver", () => {
  it("redirects to the dashboard and toasts after importing the fragment", async () => {
    onTestFinished(cleanUp);
    const success = vi.spyOn(toast, "success");
    window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

    await renderImportRoute();

    await expect.element(page.getByText("dashboard view")).toBeVisible();
    expect(loadTransactionImport()?.transactions).toHaveLength(2);
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
