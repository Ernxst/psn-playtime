import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import type { TransactionImport } from "@/domain/transactions";
import { buildTransactionsCsv } from "@/features/dashboard/export/csv";
import { signInWithToken } from "@/server/api/account.effect";
import type { DashboardData } from "@/server/providers/account/snapshot";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { dashboardData } from "@/test/dashboard-fixtures";
import { createHarness } from "@/test/harness";
import { SignInCard } from "./sign-in-card";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

const ACTIVE_KEY = "psn-playtime:dashboard-active";
const TRANSACTIONS_KEY = "psn-playtime:transactions";
const token = "a".repeat(64);

const cachedAccount = dashboardData({
  isDemo: false,
  profile: { accountId: "acc-1", onlineId: "Ernxst_" },
});

const secondAccount = {
  ...cachedAccount,
  profile: { ...cachedAccount.profile, accountId: "acc-2", onlineId: "Zoe" },
};

const importedTransactions: TransactionImport = {
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

const legacyRaw = JSON.stringify(importedTransactions);

/** Decode the active-account pointer the dashboard kvs atom persists (JSON-encoded). */
function readActiveId(): string | null {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (raw === null) return null;
  const decoded: unknown = JSON.parse(raw);
  return typeof decoded === "string" ? decoded : null;
}

describe("SignInCard", () => {
  it("leads with the connection task and keeps the manual token steps behind help", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect
      .element(page.getByRole("region", { name: "Import PlayStation history" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("link", { name: /open the ssocookie page/i }))
      .not.toBeInTheDocument();

    await page.getByText("Prepare your connection").click();

    await expect
      .element(page.getByRole("link", { name: /open the ssocookie page/i }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: /explore the demo/i })).toBeVisible();
  });

  it("keeps one input-adjacent security warning and reveals neutral implementation details", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const tokenInput = page.getByLabelText("NPSSO token");
    const warning = page.getByText(/like your password/i);

    await expect.element(warning).toBeVisible();
    expect(tokenInput.element().getAttribute("aria-describedby")).toContain(warning.element().id);

    await page.getByText("Connection details").click();

    await expect.element(page.getByText(/it reads your profile and playtime/i)).toBeVisible();
    await expect.element(page.getByText(/self-hosted/i)).toBeVisible();

    const repoLink = page.getByRole("link", { name: /open source/i });

    await expect
      .element(repoLink)
      .toHaveAttribute("href", "https://github.com/Ernxst/psn-playtime");
  });

  it("masks the token by default and lets the user show or hide it", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const token = page.getByLabelText("NPSSO token");

    await expect.element(token).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show token" }).click();

    await expect.element(token).toHaveAttribute("type", "text");
    await expect.element(page.getByRole("button", { name: "Hide token" })).toBeVisible();
  });

  it("keeps the connection action available for submit-time validation", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByRole("button", { name: "Connect PlayStation" })).toBeEnabled();
  });

  it("orders token entry, its visibility control and the primary action for keyboard users", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    page.getByLabelText("NPSSO token").element().focus();

    await userEvent.keyboard("{Tab}");

    await expect.element(page.getByRole("button", { name: "Show token" })).toHaveFocus();

    await userEvent.keyboard("{Tab}");

    await expect.element(page.getByRole("button", { name: "Connect PlayStation" })).toHaveFocus();
  });

  it("validates an empty token inline and focuses the field", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const tokenInput = page.getByLabelText("NPSSO token");
    const submit = page.getByRole("button", { name: "Connect PlayStation" });

    await submit.click();

    const tokenError = page.getByText("Paste your NPSSO token.");

    await expect.element(tokenError).toBeVisible();
    await expect.element(tokenInput).toHaveAttribute("aria-invalid", "true");
    await expect.element(tokenInput).toHaveFocus();
    expect(tokenInput.element().getAttribute("aria-describedby")).toContain(
      tokenError.element().id
    );

    await tokenInput.fill(token);
    await submit.click();

    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({
      data: { npsso: token },
    });
  });

  it("keeps a malformed nonempty token inline and focuses it", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const tokenInput = page.getByLabelText("NPSSO token");

    await tokenInput.fill("short-token");
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    const error = page.getByText("Paste the 64-character NPSSO token from PlayStation.");

    await expect.element(error).toBeVisible();
    await expect.element(tokenInput).toHaveAttribute("aria-invalid", "true");
    await expect.element(tokenInput).toHaveFocus();
    expect(tokenInput.element().getAttribute("aria-describedby")).toContain(error.element().id);
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("submitting a token caches the fetched account and makes it active", async () => {
    onTestFinished(() => localStorage.clear());
    const account = dashboardData({
      isDemo: false,
      profile: { accountId: "acc-1", onlineId: "Ernxst_" },
    });
    vi.mocked(signInWithToken).mockResolvedValue(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({
      data: { npsso: token },
    });
    await expect.poll(() => testDashboardStore.load("acc-1")).toEqual(account);
    await expect.poll(readActiveId).toBe("acc-1");
  });

  it("does not assign ownerless legacy transactions to a newly signed-in account", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    vi.mocked(signInWithToken).mockResolvedValue(cachedAccount);
    const { element } = createHarness(<SignInCard />);
    await render(element);
    localStorage.setItem(TRANSACTIONS_KEY, legacyRaw);

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    await expect.poll(() => testDashboardStore.load("acc-1")).toEqual(cachedAccount);
    expect(testTransactionStore.load("acc-1")).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacyRaw);
  });

  it("lists a cached account so a revisit needs no token", async () => {
    onTestFinished(() => localStorage.clear());
    testDashboardStore.save(
      dashboardData({
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

  it("keeps the returning-account region stable when a browser-backed account appears", async () => {
    const stableAccount = dashboardData({
      isDemo: false,
      profile: { accountId: "acc-stable", onlineId: "StableAccount" },
    });
    onTestFinished(() => testDashboardStore.remove(stableAccount.profile.accountId));
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const region = page.getByRole("region", { name: "Continue with a saved account" });
    const before = region.element().getBoundingClientRect();

    testDashboardStore.save(stableAccount);

    await expect
      .element(page.getByRole("button", { name: "Continue as StableAccount" }))
      .toBeVisible();
    expect(region.element().getBoundingClientRect().height).toBe(before.height);
  });

  it("offers a remove control for a cached account", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByRole("button", { name: "Remove Ernxst_" })).toBeVisible();
  });

  it("gates account removal behind an explicit confirm step and cancels without touching storage", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();

    await expect.element(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect.element(page.getByRole("button", { name: /Continue as Ernxst_/ })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Remove Ernxst_" })).toHaveFocus();
    expect(testDashboardStore.load("acc-1")).toStrictEqual(cachedAccount);
  });

  it.each([
    [1024, 768],
    [768, 768],
  ])(
    "keeps account-removal confirmation inside the saved-account rail at %i by %i",
    async (width, height) => {
      await page.viewport(width, height);
      onTestFinished(() => page.viewport(1280, 800));
      onTestFinished(() => localStorage.clear());
      testTransactionStore.clear(cachedAccount.profile.accountId);
      testDashboardStore.save(cachedAccount);
      const { element } = createHarness(<SignInCard />);

      await render(element);

      await page.getByRole("button", { name: "Remove Ernxst_" }).click();

      const region = page.getByRole("region", { name: "Continue with a saved account" }).element();
      const regionBounds = region.getBoundingClientRect();
      const removeBounds = page
        .getByRole("button", { name: "Remove", exact: true })
        .element()
        .getBoundingClientRect();
      const cancelBounds = page
        .getByRole("button", { name: "Cancel" })
        .element()
        .getBoundingClientRect();

      expect(region.scrollWidth).toBe(region.clientWidth);
      expect(removeBounds.left).toBeGreaterThanOrEqual(regionBounds.left);
      expect(removeBounds.right).toBeLessThanOrEqual(regionBounds.right);
      expect(cancelBounds.left).toBeGreaterThanOrEqual(regionBounds.left);
      expect(cancelBounds.right).toBeLessThanOrEqual(regionBounds.right);
    }
  );

  it("confirming removal wipes only the selected account's cached games and imported transactions", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testTransactionStore.clear(secondAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    testDashboardStore.save(secondAccount);
    testTransactionStore.save(cachedAccount.profile.accountId, importedTransactions);
    testTransactionStore.save(secondAccount.profile.accountId, importedTransactions);
    localStorage.setItem(TRANSACTIONS_KEY, legacyRaw);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect
      .element(page.getByRole("button", { name: /Continue as Ernxst_/ }))
      .not.toBeInTheDocument();
    await expect.poll(() => testDashboardStore.load("acc-1")).toBeNull();
    await expect.poll(() => testTransactionStore.load(cachedAccount.profile.accountId)).toBeNull();
    expect(testDashboardStore.load(secondAccount.profile.accountId)).toStrictEqual(secondAccount);
    expect(testTransactionStore.load(secondAccount.profile.accountId)).toStrictEqual(
      importedTransactions
    );
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacyRaw);
  });

  it("does not assign or erase ownerless legacy transactions when removal leaves one account", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testTransactionStore.clear(secondAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    testDashboardStore.save(secondAccount);
    const { element } = createHarness(<SignInCard />);
    await render(element);
    localStorage.setItem(TRANSACTIONS_KEY, legacyRaw);

    await page.getByRole("button", { name: "Remove Ernxst_" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    expect(testDashboardStore.load(secondAccount.profile.accountId)).toStrictEqual(secondAccount);
    expect(testTransactionStore.load(secondAccount.profile.accountId)).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacyRaw);
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

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    await expect.element(page.getByText("That token didn't work")).toBeVisible();
  });

  // The boundary (`@/server/api/account.effect`, #267) maps each typed PSN
  // failure to its own fixed, user-facing message, and the card surfaces that
  // message verbatim via the toast — so the right recovery copy reaches the user
  // per failure kind rather than a single "expired token" for everything.
  it.each([
    [
      "a rejected credential",
      "That token didn't work — it may be expired. Grab a fresh npsso and try again.",
    ],
    ["a rate-limit", "PlayStation is rate-limiting requests. Wait a moment and try again."],
    ["an upstream outage", "PlayStation is unavailable right now. Try again later."],
    ["an internal error", "Something went wrong on our end. Please try again."],
  ])("surfaces the distinct message for %s", async (_label, message) => {
    vi.mocked(signInWithToken).mockRejectedValue(new Error(message));
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    await expect.element(page.getByText(message)).toBeVisible();
    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({ data: { npsso: token } });
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

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    await expect
      .element(page.getByText("Unable to connect PlayStation. Check your token and try again."))
      .toBeVisible();
  });

  it("offers a restore-transactions-from-CSV affordance", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect
      .element(page.getByLabelText("Restore Ernxst_ transactions from CSV"))
      .toHaveAttribute("type", "file");
  });

  it("restores transactions from a chosen CSV and toasts the imported count", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testTransactionStore.clear(secondAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    testDashboardStore.save(secondAccount);
    localStorage.setItem(TRANSACTIONS_KEY, legacyRaw);
    const csv = buildTransactionsCsv(importedTransactions.transactions);
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
    expect(testTransactionStore.load(cachedAccount.profile.accountId)?.transactions).toHaveLength(
      1
    );
    expect(testTransactionStore.load(secondAccount.profile.accountId)).toBeNull();
    expect(localStorage.getItem(TRANSACTIONS_KEY)).toBe(legacyRaw);
  });

  it("re-importing the same CSV is idempotent and reports nothing new", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    testTransactionStore.save(cachedAccount.profile.accountId, importedTransactions);
    const csv = buildTransactionsCsv(importedTransactions.transactions);
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
      .poll(() => testTransactionStore.load(cachedAccount.profile.accountId)?.transactions)
      .toHaveLength(1);
  });

  it("surfaces a clear error toast when the chosen file is not a valid transactions CSV", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(cachedAccount.profile.accountId);
    testDashboardStore.save(cachedAccount);
    const file = new File(["not,a,transactions\r\ncsv,at,all"], "junk.csv", { type: "text/csv" });
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
    expect(testTransactionStore.load(cachedAccount.profile.accountId)).toBeNull();
  });

  it("shows connection progress and locks the token input while the request is in flight", async () => {
    onTestFinished(() => localStorage.clear());
    let resolveSignIn: (value: DashboardData) => void = () => {};
    vi.mocked(signInWithToken).mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("NPSSO token").fill(token);
    await page.getByRole("button", { name: "Connect PlayStation" }).click();

    await expect.element(page.getByRole("button", { name: "Connect PlayStation" })).toBeDisabled();
    await expect.element(page.getByLabelText("NPSSO token")).toBeDisabled();

    resolveSignIn(dashboardData());
  });
});
