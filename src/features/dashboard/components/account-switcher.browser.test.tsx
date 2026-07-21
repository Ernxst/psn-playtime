import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard, signedInPreviewDashboard } from "@/domain/mock";
import type { TransactionImport } from "@/domain/transactions";
import { PurchaseHistorySection } from "@/features/dashboard/spend/components/purchase-history";
import { activateSignedInPreview } from "@/features/prototype/prototype-data";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { useActiveDashboard } from "@/stores/dashboard-store";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { AccountSwitcher } from "./account-switcher";

const aaron: DashboardData = {
  ...demoDashboard,
  isDemo: false,
  profile: {
    ...demoDashboard.profile,
    accountId: "account-aaron",
    onlineId: "Aaron",
    sourceLabel: "Imported from PlayStation",
  },
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

function DismissibleAccountSwitcher() {
  return (
    <>
      <button type="button">Outside switcher</button>
      <ActiveAccountSwitcher />
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
  testDashboardStore.remove(signedInPreviewDashboard.profile.accountId);
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
      .element(page.getByRole("link", { name: "Add PlayStation account" }))
      .toHaveAttribute("href", "/#connect");
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
      .element(page.getByRole("link", { name: "Add PlayStation account" }))
      .toHaveAttribute("href", "/#connect");
    await expect
      .element(
        page
          .getByRole("button", { name: "Aaron, current account" })
          .getByText("Imported from PlayStation", { exact: true })
      )
      .toBeVisible();

    const currentRow = page.getByRole("button", { name: "Aaron, current account" }).element();
    const availableRow = page.getByRole("button", { name: "Switch to Zoe" }).element();

    expect(currentRow.getBoundingClientRect().height).toBe(52);
    expect(availableRow.getBoundingClientRect().height).toBe(52);
    expect(currentRow.getBoundingClientRect().x).toBe(availableRow.getBoundingClientRect().x);
    expect(currentRow.getBoundingClientRect().width).toBe(
      availableRow.getBoundingClientRect().width
    );

    availableRow.focus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("button", { name: "Switch account, current account Zoe" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
  });

  it("dismisses outside without moving focus back from the chosen target", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    testDashboardStore.save(aaron);
    testDashboardStore.setActive(aaron.profile.accountId);
    const { element } = createHarness(<DismissibleAccountSwitcher />);

    await render(element);

    await page.getByRole("button", { name: "Switch account, current account Aaron" }).click();

    await expect.element(page.getByRole("heading", { name: "Switch account" })).toBeVisible();

    await page.getByRole("button", { name: "Outside switcher" }).click();

    await expect
      .element(page.getByRole("heading", { name: "Switch account" }))
      .not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Outside switcher" })).toHaveFocus();
  });

  it("keeps the compact mobile trigger and switcher inside the viewport", async () => {
    await page.viewport(390, 844);
    cleanAccounts();
    onTestFinished(() => {
      cleanAccounts();
      return page.viewport(1280, 800);
    });
    testDashboardStore.save(aaron);
    testDashboardStore.save(zoe);
    testDashboardStore.setActive(aaron.profile.accountId);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    const trigger = page.getByRole("button", {
      name: "Switch account, current account Aaron",
    });

    expect(trigger.element().getBoundingClientRect().width).toBe(44);

    await trigger.click();

    const menu = page.getByRole("dialog", { name: "Switch account" }).element();

    expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(390);
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

  it("keeps demo current when the signed-in preview route is revisited after switching", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    activateSignedInPreview(testDashboardStore);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await page.getByRole("button", { name: /Switch account, current account MiraOnPSN/ }).click();
    await page.getByRole("button", { name: "Switch to PlayloomDemo" }).click();
    activateSignedInPreview(testDashboardStore);

    await expect
      .element(page.getByRole("button", { name: /current account PlayloomDemo/ }))
      .toBeVisible();
  });

  it("keeps demo current when the signed-in preview route is revisited after sign-out", async () => {
    cleanAccounts();
    onTestFinished(cleanAccounts);
    activateSignedInPreview(testDashboardStore);
    testDashboardStore.clearActive();

    activateSignedInPreview(testDashboardStore);
    const { element } = createHarness(<ActiveAccountSwitcher />);

    await render(element);

    await expect
      .element(page.getByRole("button", { name: /current account PlayloomDemo/ }))
      .toBeVisible();

    await page.getByRole("button", { name: /current account PlayloomDemo/ }).click();

    await expect.element(page.getByRole("button", { name: "Switch to MiraOnPSN" })).toBeVisible();
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
