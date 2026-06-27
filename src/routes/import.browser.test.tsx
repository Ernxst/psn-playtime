import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { encodeHandoff, HANDOFF_VERSION, type HandoffPayload } from "@/lib/psn/transactions";
import { clearTransactionImport, useTransactionImport } from "@/lib/transactions-store";
import { createHarness } from "@/test/harness";
import { ImportReceiver } from "./import";

const payload: HandoffPayload = {
  v: HANDOFF_VERSION,
  source: "store.playstation.com",
  scrapedAt: "2024-01-01T00:00:00.000Z",
  rows: [
    { date: "12 May 2023", amount: "-£33.00", description: "Satisfactory" },
    { date: "01/01/2024", amount: "£10.00", description: "PlayStation Store Wallet" },
  ],
};

/** Surfaces the persisted import count so the effect's write can be awaited. */
function Probe() {
  const imported = useTransactionImport();
  return <div>imported:{imported?.transactions.length ?? 0}</div>;
}

function cleanUp() {
  clearTransactionImport();
  window.location.hash = "";
}

test("persists the transactions handed over in the URL fragment", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff(payload)}`;

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

test("shows the invalid state when no transactions can be parsed", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff({
    ...payload,
    rows: [{ date: "x", amount: "Free", description: "Demo" }],
  })}`;

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText(/couldn't read any transactions/)).toBeVisible();
});
