import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionImport } from "@/domain/transactions";
import { PurchaseHistorySection } from "@/features/dashboard/spend/components/purchase-history";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useActiveDashboard } from "@/stores/dashboard-store";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { AccountSwitcher } from "./account-switcher";

const aaron: DashboardData = {
  ...demoDashboard,
  isDemo: false,
  profile: { ...demoDashboard.profile, accountId: "account-aaron", onlineId: "Aaron" },
};

const zoe: DashboardData = {
  ...demoDashboard,
  isDemo: false,
  profile: { ...demoDashboard.profile, accountId: "account-zoe", onlineId: "Zoe" },
};

function ActiveAccountSwitcher() {
  return <AccountSwitcher profile={useActiveDashboard().profile} />;
}

function ActiveAccountTransactions() {
  const data = useActiveDashboard();
  return (
    <>
      <AccountSwitcher profile={data.profile} />
      <PurchaseHistorySection data={data} />
    </>
  );
}

function transaction(productName: string): TransactionImport {
  return {
    transactions: [
      {
        transactionId: productName,
        key: productName,
        date: "2024-01-01",
        transactionType: "PRODUCT_PURCHASE",
        kind: "purchase",
        productName,
        quantity: 1,
        amountMinor: 1000,
        currency: "£",
        displayAmount: "£10.00",
      },
    ],
    importedAt: "2024-01-02T00:00:00.000Z",
    source: "store.playstation.com",
  };
}

function cleanAccounts() {
  testDashboardStore.remove(aaron.profile.accountId);
  testDashboardStore.remove(zoe.profile.accountId);
  testDashboardStore.clearActive();
  testTransactionStore.clear(aaron.profile.accountId);
  testTransactionStore.clear(zoe.profile.accountId);
}

describe("AccountSwitcher", () => {
  it("renders the demo dataset as the only available profile when there are no imports", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await expect
      .element(page.getByText(demoDashboard.profile.onlineId, { exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: /switch account/i }).click();
    await expect
      .element(page.getByRole("button", { name: "PlayloomDemo, current account" }))
      .toHaveAttribute("aria-current", "true");
  });

  it("opens the switcher for one cached account and links to Add account", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron);
    testDashboardStore.setActive(aaron.profile.accountId);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await page.getByRole("button", { name: "Switch account, current account Aaron" }).click();

    await expect
      .element(page.getByRole("button", { name: "Aaron, current account" }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(page.getByRole("link", { name: "Add account" }))
      .toHaveAttribute("href", "/");
  });

  it("switches cached accounts with the keyboard and closes the popover", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron);
    testDashboardStore.save(zoe);
    testDashboardStore.setActive(aaron.profile.accountId);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    const trigger = page.getByRole("button", {
      name: "Switch account, current account Aaron",
    });
    trigger.element().focus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("heading", { name: "Switch account" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Aaron, current account" }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(page.getByRole("link", { name: "Add account" }))
      .toHaveAttribute("href", "/");

    page.getByRole("button", { name: "Switch to Zoe" }).element().focus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("button", { name: "Switch account, current account Zoe" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
  });

  it("switches the dashboard to the selected account's transactions", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron);
    testDashboardStore.save(zoe);
    testDashboardStore.setActive(aaron.profile.accountId);
    testTransactionStore.save(aaron.profile.accountId, transaction("Aaron purchase"));
    testTransactionStore.save(zoe.profile.accountId, transaction("Zoe purchase"));
    const { element } = createHarness(<ActiveAccountTransactions />);

    await render(element);

    await expect.element(page.getByText("Aaron purchase")).toBeVisible();
    await expect.element(page.getByText("Zoe purchase")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Switch account, current account Aaron" }).click();
    await page.getByRole("button", { name: "Switch to Zoe" }).click();

    await expect.element(page.getByText("Zoe purchase")).toBeVisible();
    await expect.element(page.getByText("Aaron purchase")).not.toBeInTheDocument();
  });

  it("switches from the demo dashboard to a cached account", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron);
    testDashboardStore.clearActive();
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await page
      .getByRole("button", {
        name: `Switch account, current account ${demoDashboard.profile.onlineId}`,
      })
      .click();
    await page.getByRole("button", { name: "Switch to Aaron" }).click();

    await expect.element(page.getByText("Aaron", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
  });
});
