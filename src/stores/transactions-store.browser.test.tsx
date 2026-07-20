import { useState } from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import type { TransactionImport } from "@/domain/transactions";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import { useTransactionImport } from "./transactions-store";

const ACCOUNT_A = "acc-1";
const ACCOUNT_B = "acc-2";

const validImport: TransactionImport = {
  transactions: [
    {
      transactionId: "T1",
      key: "k1",
      date: "2024-01-01",
      transactionType: "PURCHASE",
      kind: "purchase",
      productName: "Some Game",
      quantity: 1,
      amountMinor: 4490,
      currency: "£",
      displayAmount: "£44.90",
    },
  ],
  importedAt: "2024-01-02T00:00:00.000Z",
  source: "store.playstation.com",
};

function ImportedCount({ accountId }: { accountId: string }) {
  const imported = useTransactionImport(accountId);
  return <p>{imported ? `${imported.transactions.length} imported` : "no import"}</p>;
}

function AccountImportSwitcher() {
  const [accountId, setAccountId] = useState(ACCOUNT_A);
  const imported = useTransactionImport(accountId);
  return (
    <>
      <button onClick={() => setAccountId(ACCOUNT_B)}>Switch account</button>
      <p>{`${accountId}: ${imported?.transactions.length ?? 0} imported`}</p>
    </>
  );
}

function cleanTransactions() {
  testTransactionStore.clear(ACCOUNT_A);
  testTransactionStore.clear(ACCOUNT_B);
}

describe(".useTransactionImport", () => {
  it("re-renders with the requested account after a store save", async () => {
    onTestFinished(cleanTransactions);
    await render(<ImportedCount accountId={ACCOUNT_A} />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("no import")).toBeVisible();

    testTransactionStore.save(ACCOUNT_A, validImport);

    await expect.element(page.getByText("1 imported")).toBeVisible();
  });

  it("shows each account's own import when the active account changes", async () => {
    onTestFinished(cleanTransactions);
    const second = {
      ...validImport,
      transactions: [validImport.transactions[0]!, { ...validImport.transactions[0]!, key: "k2" }],
    };
    testTransactionStore.save(ACCOUNT_A, validImport);
    testTransactionStore.save(ACCOUNT_B, second);
    await render(<AccountImportSwitcher />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("acc-1: 1 imported")).toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Switch account" }));

    await expect.element(page.getByText("acc-2: 2 imported")).toBeVisible();
  });

  it("re-renders only the cleared account back to no import", async () => {
    onTestFinished(cleanTransactions);
    await render(<ImportedCount accountId={ACCOUNT_A} />, { wrapper: TestAtomProvider });
    testTransactionStore.save(ACCOUNT_A, validImport);
    testTransactionStore.save(ACCOUNT_B, { ...validImport, source: "second.account" });

    await expect.element(page.getByText("1 imported")).toBeVisible();

    testTransactionStore.clear(ACCOUNT_A);

    await expect.element(page.getByText("no import")).toBeVisible();
    expect(testTransactionStore.load(ACCOUNT_B)?.source).toBe("second.account");
  });
});
