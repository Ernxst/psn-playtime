import { useState } from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import * as Transactions from "@/test/factories/transactions";
import { useTransactionImport } from "./transactions-store";

const ACCOUNT_A = "acc-1";
const ACCOUNT_B = "acc-2";

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

    testTransactionStore.save(ACCOUNT_A, Transactions.importRecord());

    await expect.element(page.getByText("1 imported")).toBeVisible();
  });

  it("shows each account's own import when the active account changes", async () => {
    onTestFinished(cleanTransactions);
    const second = Transactions.importRecord({
      transactions: [Transactions.row(), Transactions.row({ key: "k2" })],
    });
    testTransactionStore.save(ACCOUNT_A, Transactions.importRecord());
    testTransactionStore.save(ACCOUNT_B, second);
    await render(<AccountImportSwitcher />, { wrapper: TestAtomProvider });

    await expect.element(page.getByText("acc-1: 1 imported")).toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Switch account" }));

    await expect.element(page.getByText("acc-2: 2 imported")).toBeVisible();
  });

  it("re-renders only the cleared account back to no import", async () => {
    onTestFinished(cleanTransactions);
    await render(<ImportedCount accountId={ACCOUNT_A} />, { wrapper: TestAtomProvider });
    testTransactionStore.save(ACCOUNT_A, Transactions.importRecord());
    testTransactionStore.save(ACCOUNT_B, Transactions.importRecord({ source: "second.account" }));

    await expect.element(page.getByText("1 imported")).toBeVisible();

    testTransactionStore.clear(ACCOUNT_A);

    await expect.element(page.getByText("no import")).toBeVisible();
    expect(testTransactionStore.load(ACCOUNT_B)?.source).toBe("second.account");
  });
});
