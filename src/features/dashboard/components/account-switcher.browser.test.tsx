import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { PurchaseHistorySection } from "@/features/dashboard/spend/components/purchase-history";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useActiveDashboard } from "@/stores/dashboard-store";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { createHarness } from "@/test/harness";
import { AccountSwitcher } from "./account-switcher";

const aaron = (): DashboardData =>
  Dashboard.data({
    isDemo: false,
    profile: { accountId: "account-aaron", onlineId: "Aaron" },
  });

const zoe = (): DashboardData =>
  Dashboard.data({
    isDemo: false,
    profile: { accountId: "account-zoe", onlineId: "Zoe" },
  });

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

function transaction(productName: string) {
  return Transactions.importRecord({
    transactions: [
      Transactions.row({
        transactionId: productName,
        key: productName,
        productName,
      }),
    ],
  });
}

function cleanAccounts() {
  testDashboardStore.remove(aaron().profile.accountId);
  testDashboardStore.remove(zoe().profile.accountId);
  testDashboardStore.clearActive();
  testTransactionStore.clear(aaron().profile.accountId);
  testTransactionStore.clear(zoe().profile.accountId);
}

describe("AccountSwitcher", () => {
  it("renders the demo account as text when there are no cached accounts", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await expect
      .element(page.getByText(Dashboard.data().profile.onlineId, { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: /switch account/i }))
      .not.toBeInTheDocument();
  });

  it("opens the switcher for one cached account and links to Add account", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron());
    testDashboardStore.setActive(aaron().profile.accountId);
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
    testDashboardStore.save(aaron());
    testDashboardStore.save(zoe());
    testDashboardStore.setActive(aaron().profile.accountId);
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
      .element(
        page.getByRole("button", {
          name: "Switch account, current account Zoe",
        })
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
  });

  it("switches the dashboard to the selected account's transactions", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron());
    testDashboardStore.save(zoe());
    testDashboardStore.setActive(aaron().profile.accountId);
    testTransactionStore.save(aaron().profile.accountId, transaction("Aaron purchase"));
    testTransactionStore.save(zoe().profile.accountId, transaction("Zoe purchase"));
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
    testDashboardStore.save(aaron());
    testDashboardStore.clearActive();
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await page
      .getByRole("button", {
        name: `Switch account, current account ${Dashboard.data().profile.onlineId}`,
      })
      .click();
    await page.getByRole("button", { name: "Switch to Aaron" }).click();

    await expect.element(page.getByText("Aaron", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
  });
});
