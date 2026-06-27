import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import type { Transaction } from "@/lib/psn/transactions";
import { clearTransactionImport, saveTransactionImport } from "@/lib/transactions-store";
import { SpendSection } from "./spend";

function seed(transactions: Transaction[]) {
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

test("shows the value leaderboard once transactions are imported", async () => {
  seed([
    {
      date: "2022-05-12",
      description: "Satisfactory",
      amount: 33,
      currency: "£",
      kind: "purchase",
    },
  ]);

  await render(<SpendSection data={demoDashboard} />);

  await expect.element(page.getByText("Best value per hour")).toBeVisible();
  await expect.element(page.getByText("What you've spent")).toBeVisible();
  await expect.element(page.getByText("Satisfactory")).toBeVisible();
});
