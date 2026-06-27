import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import {
  encodeHandoff,
  flattenApiTransactions,
  HANDOFF_VERSION,
  type HandoffPayload,
  type TransactionRow,
} from "@/lib/psn/transactions";
import {
  clearTransactionImport,
  saveTransactionImport,
  useTransactionImport,
} from "@/lib/transactions-store";
import { createHarness } from "@/test/harness";
import { multiProductPurchase } from "@/test/transaction-fixtures";
import { ImportReceiver } from "./import-receiver";

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

/** Surfaces the persisted import count so the effect's write can be awaited. */
function Probe() {
  const imported = useTransactionImport();
  return <div>imported:{imported?.transactions.length ?? 0}</div>;
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

test("persists the transactions handed over in the URL fragment", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  await expect.element(page.getByText("imported:2")).toBeVisible();
});

test("shows the empty state when there is no fragment data", async () => {
  onTestFinished(cleanUp);
  window.location.hash = "";

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText(/no import data in the link/)).toBeVisible();
});

test("shows the invalid state when the fragment carries no rows", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff(payloadOf([]))}`;

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText(/couldn't read any transactions/)).toBeVisible();
});

test("appends a fragment import onto a prior one, de-duping by row key", async () => {
  onTestFinished(cleanUp);
  seedPrior([rows[0]!]);
  window.location.hash = `#${encodeHandoff(payloadOf(rows))}`;

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  // The prior row repeats and only the second row is appended.
  await expect.element(page.getByText("imported:2")).toBeVisible();
});

test("ignores a fragment whose payload fails schema validation", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#data=${encodeURIComponent(JSON.stringify({ v: 99, transactions: "nope" }))}`;

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText("imported:0")).toBeVisible();
});
