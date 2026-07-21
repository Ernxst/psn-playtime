import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type { GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import * as Transactions from "@/test/factories/transactions";
import { ExportButtons } from "./export-buttons";

function game(overrides: Partial<GamePlay>): GamePlay {
  return {
    titleId: "PPSA01234",
    name: "Hades",
    platform: "PS5",
    hours: 42.5,
    playCount: 30,
    genre: "Action-Adventure",
    isApp: false,
    ...overrides,
  };
}

const dashboardDefaults = {
  profile: {
    onlineId: "tester",
    accountId: "acc",
    isPlus: false,
    trophyLevel: 1,
    levelProgress: 0,
    earned: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
    totalTrophies: 0,
  },
  fetchedAt: "2024-06-01T00:00:00.000Z",
  meta: { totalHours: 0, totalSessions: 0, appsExcluded: [], span: {} },
  isDemo: false,
  trophiesUnavailable: false,
} as const;

describe("ExportButtons", () => {
  it("renders a button for each export", async () => {
    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [game({})],
          meta: { ...dashboardDefaults.meta, totalGames: 1 },
        })}
        transactions={[
          Transactions.row({
            key: "line-1",
            skuId: undefined,
            skuType: undefined,
            originalPriceMinor: undefined,
            discountMinor: undefined,
          }),
        ]}
      />
    );

    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Export account (CSV)" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Export transactions (CSV)" }))
      .toBeVisible();
  });

  it("enables the games and account exports when the library has titles", async () => {
    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [game({})],
          meta: { ...dashboardDefaults.meta, totalGames: 1 },
        })}
        transactions={[]}
      />
    );

    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeEnabled();
    await expect.element(page.getByRole("button", { name: "Export account (CSV)" })).toBeEnabled();
  });

  it("disables the games and account exports for an empty library", async () => {
    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [],
          meta: { ...dashboardDefaults.meta, totalGames: 0 },
        })}
        transactions={[]}
      />
    );

    await expect.element(page.getByRole("button", { name: "Export games (CSV)" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Export account (CSV)" })).toBeDisabled();
  });

  it("disables the transactions export when nothing was imported", async () => {
    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [game({})],
          meta: { ...dashboardDefaults.meta, totalGames: 1 },
        })}
        transactions={[]}
      />
    );

    await expect
      .element(page.getByRole("button", { name: "Export transactions (CSV)" }))
      .toBeDisabled();
  });

  it("downloads a CSV blob through a transient object URL when clicked", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [game({})],
          meta: { ...dashboardDefaults.meta, totalGames: 1 },
        })}
        transactions={[
          Transactions.row({
            key: "line-1",
            skuId: undefined,
            skuType: undefined,
            originalPriceMinor: undefined,
            discountMinor: undefined,
          }),
        ]}
      />
    );

    await page.getByRole("button", { name: "Export games (CSV)" }).click();

    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:test");
  });

  it("downloads the account and transactions CSVs, with untagged filenames for a blank id", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, "download", "set")
      .mockImplementation(() => {});

    await render(
      <ExportButtons
        data={Dashboard.data({
          ...dashboardDefaults,
          games: [game({})],
          profile: { ...dashboardDefaults.profile, onlineId: "" },
          meta: { ...dashboardDefaults.meta, totalGames: 1 },
        })}
        transactions={[
          Transactions.row({
            key: "line-1",
            skuId: undefined,
            skuType: undefined,
            originalPriceMinor: undefined,
            discountMinor: undefined,
          }),
        ]}
      />
    );

    await page.getByRole("button", { name: "Export account (CSV)" }).click();
    await page.getByRole("button", { name: "Export transactions (CSV)" }).click();

    expect(click).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenNthCalledWith(1, "psn-account.csv");
    expect(download).toHaveBeenNthCalledWith(2, "psn-transactions.csv");
  });
});
