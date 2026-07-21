import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { buildTransactionsCsv } from "@/features/dashboard/export/csv";
import { signInWithToken } from "@/server/api/account.effect";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { createHarness } from "@/test/harness";
import { SignInCard } from "./sign-in-card";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

const ACTIVE_KEY = "psn-playtime:dashboard-active";
const TRANSACTIONS_KEY = "psn-playtime:transactions";

function cachedAccount() {
  return Dashboard.data({
    isDemo: false,
    profile: { accountId: "acc-1", onlineId: "Ernxst_" },
  });
}

function secondAccount() {
  return Dashboard.data({
    isDemo: false,
    profile: { accountId: "acc-2", onlineId: "Zoe" },
  });
}

function importedTransactions() {
  return Transactions.importRecord({
    transactions: [
      Transactions.row({
        transactionId: "T1",
        key: "k1",
        date: "2024-01-01",
        transactionType: "PURCHASE",
        productName: "Some Game",
        amountMinor: 4490,
        displayAmount: "£44.90",
      }),
    ],
    importedAt: "2024-01-02T00:00:00.000Z",
  });
}
function legacyRaw() {
  return JSON.stringify(importedTransactions());
}

/** Decode the active-account pointer the dashboard kvs atom persists (JSON-encoded). */
function readActiveId(): string | null {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (raw === null) return null;
  const decoded: unknown = JSON.parse(raw);
  return typeof decoded === "string" ? decoded : null;
}

describe("SignInCard", () => {
  it("renders the connect-account card with the manual steps", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByText("Connect your account")).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: /open the ssocookie page/i }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: /explore the demo/i })).toBeVisible();
  });

  it("keeps the risk details, including the password-grade warning, hidden until the learn-more action is opened", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByText("Learn about the risk")).toBeVisible();
    await expect
      .element(page.getByText(/full access to your PlayStation account/i))
      .not.toBeVisible();
    await expect.element(page.getByText(/It is read-only/i)).not.toBeVisible();
    await expect.element(page.getByText(/never logged or stored/i)).not.toBeVisible();
  });

  it("opening the learn-more action reveals the password-grade warning, read-only, storage, open-source and self-host detail", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByText("Learn about the risk").click();

    await expect.element(page.getByText(/full access to your PlayStation account/i)).toBeVisible();
    await expect.element(page.getByText(/Never share it/i)).toBeVisible();
    await expect.element(page.getByText(/do not enter your token/i)).toBeVisible();
    await expect.element(page.getByText(/It is read-only/i)).toBeVisible();
    await expect
      .element(page.getByText(/sent to the server only to load your data once, then discarded/i))
      .toBeVisible();
    await expect.element(page.getByText(/self-host your own instance/i)).toBeVisible();
    await expect.element(page.getByText(/expires after about 2 months/i)).toBeVisible();

    const repoLink = page.getByRole("link", { name: /open source/i });

    await expect
      .element(repoLink)
      .toHaveAttribute("href", "https://github.com/Ernxst/psn-playtime");
  });

  it("disables sign-in until the risk is acknowledged", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

    await page.getByText(/sign in to my PlayStation account/i).click();

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("does not request sign-in while the risk is unacknowledged", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("submitting an empty token after acknowledging shows a validation toast and skips the request", async () => {
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("Paste your npsso token first.")).toBeVisible();
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("submitting a token after acknowledging caches the fetched account and makes it active", async () => {
    onTestFinished(() => localStorage.clear());
    const account = Dashboard.data({
      isDemo: false,
      profile: { accountId: "acc-1", onlineId: "Ernxst_" },
    });
    vi.mocked(signInWithToken).mockResolvedValue(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({
      data: { npsso: "a-valid-looking-token" },
    });
    await expect.poll(() => testDashboardStore.load("acc-1")).toStrictEqual(account);
    await expect.poll(readActiveId).toBe("acc-1");
  });

  it("does not assign ownerless legacy transactions to a newly signed-in account", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    vi.mocked(signInWithToken).mockResolvedValue(account);
    const { element } = createHarness(<SignInCard />);
    await render(element);
    const legacy = legacyRaw();
    localStorage.setItem(TRANSACTIONS_KEY, legacy);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.poll(() => testDashboardStore.load("acc-1")).toStrictEqual(account);
    expect(testTransactionStore.load("acc-1")).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacy);
  });

  it("lists a cached account so a revisit needs no token", async () => {
    onTestFinished(() => localStorage.clear());
    testDashboardStore.save(
      Dashboard.data({
        isDemo: false,
        profile: { accountId: "acc-1", onlineId: "Ernxst_" },
      })
    );
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: /Continue as Ernxst_/ }).click();

    await expect.poll(readActiveId).toBe("acc-1");
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("offers a remove control for a cached account", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByRole("button", { name: "Remove Ernxst_" })).toBeVisible();
  });

  it("gates account removal behind an explicit confirm step and cancels without touching storage", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();

    await expect.element(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect.element(page.getByRole("button", { name: /Continue as Ernxst_/ })).toBeVisible();
    expect(testDashboardStore.load("acc-1")).toStrictEqual(account);
  });

  it("confirming removal wipes the account's cached games and its imported transactions", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    testTransactionStore.save(account.profile.accountId, importedTransactions());
    const legacy = legacyRaw();
    localStorage.setItem(TRANSACTIONS_KEY, legacy);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect
      .element(page.getByRole("button", { name: /Continue as Ernxst_/ }))
      .not.toBeInTheDocument();
    await expect.poll(() => testDashboardStore.load("acc-1")).toBeNull();
    await expect.poll(() => testTransactionStore.load(account.profile.accountId)).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacy);
  });

  it("does not assign or erase ownerless legacy transactions when removal leaves one account", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    const otherAccount = secondAccount();
    testTransactionStore.clear(otherAccount.profile.accountId);
    testDashboardStore.save(account);
    testDashboardStore.save(otherAccount);
    const { element } = createHarness(<SignInCard />);
    await render(element);
    const legacy = legacyRaw();
    localStorage.setItem(TRANSACTIONS_KEY, legacy);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    expect(testDashboardStore.load(otherAccount.profile.accountId)).toStrictEqual(otherAccount);
    expect(testTransactionStore.load(otherAccount.profile.accountId)).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacy);
  });

  it("a failed sign-in surfaces the error message as a toast", async () => {
    vi.mocked(signInWithToken).mockRejectedValue(new Error("That token didn't work"));
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("npsso token").fill("stale-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("That token didn't work")).toBeVisible();
  });

  it("falls back to a generic message when the rejection is not an Error", async () => {
    vi.mocked(signInWithToken).mockRejectedValue("boom");
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("npsso token").fill("stale-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("Sign in failed. Check your token.")).toBeVisible();
  });

  it("offers a restore-transactions-from-CSV affordance", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect
      .element(page.getByLabelText("Restore Ernxst_ transactions from CSV"))
      .toHaveAttribute("type", "file");
  });

  it("restores transactions from a chosen CSV and toasts the imported count", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    const otherAccount = secondAccount();
    testTransactionStore.clear(otherAccount.profile.accountId);
    testDashboardStore.save(account);
    testDashboardStore.save(otherAccount);
    const legacy = legacyRaw();
    localStorage.setItem(TRANSACTIONS_KEY, legacy);
    const csv = buildTransactionsCsv(importedTransactions().transactions);
    const file = new File([csv], "transactions.csv", { type: "text/csv" });
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await userEvent.upload(page.getByLabelText("Restore Ernxst_ transactions from CSV"), file);

    await expect.element(page.getByText("Restored 1 transaction (1 in total).")).toBeVisible();
    expect(testTransactionStore.load(account.profile.accountId)?.transactions).toHaveLength(1);
    expect(testTransactionStore.load(otherAccount.profile.accountId)).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacy);
  });

  it("re-importing the same CSV is idempotent and reports nothing new", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    testTransactionStore.save(account.profile.accountId, importedTransactions());
    const csv = buildTransactionsCsv(importedTransactions().transactions);
    const file = new File([csv], "transactions.csv", { type: "text/csv" });
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await userEvent.upload(page.getByLabelText("Restore Ernxst_ transactions from CSV"), file);

    await expect.element(page.getByText("Those transactions are already imported.")).toBeVisible();
    await expect
      .poll(() => testTransactionStore.load(account.profile.accountId)?.transactions)
      .toHaveLength(1);
  });

  it("surfaces a clear error toast when the chosen file is not a valid transactions CSV", async () => {
    onTestFinished(() => localStorage.clear());
    const account = cachedAccount();
    testTransactionStore.clear(account.profile.accountId);
    testDashboardStore.save(account);
    const file = new File(["not,a,transactions\r\ncsv,at,all"], "junk.csv", {
      type: "text/csv",
    });
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await userEvent.upload(page.getByLabelText("Restore Ernxst_ transactions from CSV"), file);

    await expect
      .element(
        page.getByText(
          "We couldn't read that file as a transactions CSV. Export it again and try again."
        )
      )
      .toBeVisible();
    expect(testTransactionStore.load(account.profile.accountId)).toBeNull();
  });

  it("shows a signing-in spinner and locks the token input while the request is in flight", async () => {
    onTestFinished(() => localStorage.clear());
    const { promise, resolve } = Promise.withResolvers<ReturnType<typeof Dashboard.data>>();
    vi.mocked(signInWithToken).mockReturnValue(promise);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByRole("button", { name: /signing in/i })).toBeDisabled();
    await expect.element(page.getByLabelText("npsso token")).toBeDisabled();

    resolve(Dashboard.data());
  });
});
