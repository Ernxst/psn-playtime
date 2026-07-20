import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { buildAccountCsv, buildGamesCsv } from "@/features/dashboard/export/csv";
import type { GamePlay, ProfileSummary } from "@/server/providers/account/snapshot";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { RestoreDashboardCard } from "./restore-dashboard-card";

const profile: ProfileSummary = {
  onlineId: "Ernxst_",
  accountId: "acc-42",
  isPlus: true,
  trophyLevel: 120,
  levelProgress: 12,
  earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
  totalTrophies: 10,
};

const games: GamePlay[] = [
  {
    titleId: "PPSA01234",
    name: "Hades",
    platform: "PS5",
    hours: 42.5,
    playCount: 30,
    genre: "Action-Adventure",
    isApp: false,
    trophy: {
      progress: 100,
      earned: { platinum: 1, gold: 2, silver: 3, bronze: 4 },
      total: 10,
      hasPlatinum: true,
    },
  },
];

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

const gamesFile = () =>
  csvFile("psn-games.csv", buildGamesCsv(games, [{ name: "Netflix", hours: 5 }]));
const accountFile = () => csvFile("psn-account.csv", buildAccountCsv(profile));
const transactionsKey = "psn-playtime:transactions";
const legacyRaw = JSON.stringify({
  transactions: [],
  importedAt: "2024-01-02T00:00:00.000Z",
  source: "store.playstation.com",
});

describe("RestoreDashboardCard", () => {
  it("renders the restore card with both file pickers", async () => {
    await render(createHarness(<RestoreDashboardCard />).element);

    await expect.element(page.getByText("Restore from CSV")).toBeVisible();
    await expect.element(page.getByLabelText("Games CSV")).toBeVisible();
    await expect.element(page.getByLabelText("Account CSV")).toBeVisible();
  });

  it("keeps the restore action disabled until both CSVs are picked", async () => {
    await render(createHarness(<RestoreDashboardCard />).element);

    await expect.element(page.getByRole("button", { name: /restore dashboard/i })).toBeDisabled();

    await page.getByLabelText("Games CSV").upload(gamesFile());

    await expect.element(page.getByRole("button", { name: /restore dashboard/i })).toBeDisabled();
  });

  it("reconstructs and caches the dashboard from the picked CSVs", async () => {
    const setActive = vi.spyOn(testDashboardStore, "setActive");

    await render(createHarness(<RestoreDashboardCard />).element);

    await page.getByLabelText("Games CSV").upload(gamesFile());
    await page.getByLabelText("Account CSV").upload(accountFile());
    await page.getByRole("button", { name: /restore dashboard/i }).click();

    await expect.poll(() => testDashboardStore.load("acc-42")?.profile.accountId).toBe("acc-42");
    expect(testDashboardStore.load("acc-42")?.games.map((game) => game.name)).toStrictEqual([
      "Hades",
    ]);
    expect(testDashboardStore.load("acc-42")?.meta.appsExcluded).toStrictEqual([
      { name: "Netflix", hours: 5 },
    ]);
    expect(setActive).toHaveBeenCalledExactlyOnceWith("acc-42");

    setActive.mockRestore();
  });

  it("does not assign ownerless legacy transactions to the restored dashboard", async () => {
    onTestFinished(() => localStorage.clear());
    testTransactionStore.clear(profile.accountId);
    await render(createHarness(<RestoreDashboardCard />).element);
    localStorage.setItem(transactionsKey, legacyRaw);

    await page.getByLabelText("Games CSV").upload(gamesFile());
    await page.getByLabelText("Account CSV").upload(accountFile());
    await page.getByRole("button", { name: /restore dashboard/i }).click();

    await expect.poll(() => testDashboardStore.load(profile.accountId)).not.toBeNull();
    expect(testTransactionStore.load(profile.accountId)).toBeNull();
    expect(localStorage.getItem(transactionsKey)).toBe(legacyRaw);
  });

  it("surfaces an error and does not cache when a CSV is malformed", async () => {
    const save = vi.spyOn(testDashboardStore, "save");

    await render(
      <>
        {createHarness(<RestoreDashboardCard />).element}
        <Toaster />
      </>
    );

    await page.getByLabelText("Games CSV").upload(csvFile("bad.csv", "not,a,valid\ngames,csv,row"));
    await page.getByLabelText("Account CSV").upload(accountFile());
    await page.getByRole("button", { name: /restore dashboard/i }).click();

    await expect.element(page.getByText(/expected|missing|invalid/i)).toBeVisible();
    expect(save).not.toHaveBeenCalled();

    save.mockRestore();
  });
});
