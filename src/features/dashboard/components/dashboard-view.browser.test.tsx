/* oxlint-disable test-contract/no-dom-selector -- These integration tests verify dashboard layout, CSS ownership, and geometry. */
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import { Connect } from "@/features/onboarding/components/connect";
import { prototypeDashboard } from "@/features/prototype/prototype-data";
import { useActiveDashboard } from "@/stores/dashboard-store";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { DashboardView } from "./dashboard-view";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

function ActiveDashboardView() {
  return (
    <DashboardView
      data={prototypeDashboard(useActiveDashboard())}
      onRefresh={vi.fn()}
      onSignOut={vi.fn()}
      signingOut={false}
    />
  );
}

/** A base-game purchase matched to a demo library titleId by skuId. */
function baseFor(titleId: string, amountMinor: number): TransactionRow {
  return {
    transactionId: `${titleId}-base`,
    key: `${titleId}-base`,
    date: "2022-05-12",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: titleId,
    skuId: `EP0001-${titleId}-00000000000000N1-U001`,
    skuType: "STANDARD",
    quantity: 1,
    amountMinor,
    currency: "£",
    displayAmount: "",
  };
}

describe("DashboardView", () => {
  it("discloses partial RAWG metadata beside Genres and lets the reader retry", async () => {
    const onRetry = vi.fn();
    const imported = {
      ...demoDashboard,
      isDemo: false,
      profile: { ...demoDashboard.profile, accountId: "imported" },
    };
    const { element } = createHarness(
      <DashboardView
        data={imported}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
        enrichment={{
          genres: { status: "partial", retrying: false, onRetry },
          franchises: { status: "complete", retrying: false },
        }}
      />
    );

    await render(element);

    await expect
      .element(
        page.getByText(
          "Some genre metadata is still missing. Showing only the RAWG matches available for this account."
        )
      )
      .toBeVisible();

    await page.getByRole("button", { name: "Retry genre metadata" }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("composes the header, KPIs, chart sections and games table from the data", async () => {
    const data = prototypeDashboard(demoDashboard);
    const { element } = createHarness(
      <DashboardView data={data} onRefresh={vi.fn()} onSignOut={vi.fn()} signingOut={false} />
    );

    const { container } = await render(element);

    await expect
      .element(page.getByRole("heading", { name: demoDashboard.profile.onlineId }))
      .toBeVisible();

    const overview = document.querySelector("#overview")?.textContent ?? "";

    expect(overview).toContain("Lifetime play");
    expect(overview).toContain("Games played");
    expect(overview).toContain("Sessions");
    expect(overview).toContain("Avg per game");
    expect(overview).toContain("Avg session");
    expect(overview).not.toContain("Trophy level");
    expect(container.querySelector('[data-source="psn"]')).not.toBeNull();
    expect(container.querySelector('[data-source="rawg-fixture"]')).not.toBeNull();
    expect(container.querySelector('[data-source="deterministic"]')).not.toBeNull();
    expect(container.querySelector('[data-source="psn"] .playloom-poster-psn')).not.toBeNull();

    const shellHeader = container.querySelector<HTMLElement>(
      '[data-slot="dashboard-shell-header"]'
    );

    expect(shellHeader?.getBoundingClientRect().height).toBe(60);
    expect(shellHeader?.querySelector('[aria-label="Playloom — go to home page"]')).not.toBeNull();
    expect(container.querySelectorAll('[aria-label="Playloom — go to home page"]')).toHaveLength(1);

    // Reveal the deferred chart section so its IntersectionObserver fires and loads the chart.
    // The section itself is deliberately not rendered through an accessible locator yet.
    // oxlint-disable-next-line test-contract/no-dom-selector
    document.getElementById("top-games")?.scrollIntoView();

    await expect.element(page.getByText("Top games by hours")).toBeVisible();
    await expect.element(page.getByText("Every game you've played")).toBeVisible();
  });

  it("keeps the opening identity and all five Overview metrics in the first desktop viewport", async () => {
    await page.viewport(1440, 900);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(
      <DashboardView
        data={prototypeDashboard(demoDashboard)}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByRole("main")).toBeVisible();
    await expect.element(page.getByText("Lifetime play", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Games played", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Sessions", { exact: true }).first()).toBeVisible();
    await expect.element(page.getByText("Avg per game", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Avg session", { exact: true })).toBeVisible();
    expect(
      page.getByText("Avg session", { exact: true }).element().getBoundingClientRect().bottom
    ).toBeLessThanOrEqual(900);
    await expect.element(page.getByText("Lifetime-hours caveat.")).toBeVisible();
  });

  it("stacks legible timeframe and search controls beside the sidebar at 768 by 900", async () => {
    await page.viewport(768, 900);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(
      <DashboardView
        data={prototypeDashboard(demoDashboard)}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const allTime = page.getByRole("radio", { name: "All time" }).element().parentElement;
    const twelveMonths = page.getByRole("radio", { name: "12 months" }).element().parentElement;
    const twoYears = page.getByRole("radio", { name: "2 years" }).element().parentElement;
    const thisYear = page.getByRole("radio", { name: "This year" }).element().parentElement;
    const search = page.getByRole("searchbox", { name: "Search games by name" }).element();
    const allTimeRect = allTime?.getBoundingClientRect();
    const twelveMonthsRect = twelveMonths?.getBoundingClientRect();
    const twoYearsRect = twoYears?.getBoundingClientRect();
    const thisYearRect = thisYear?.getBoundingClientRect();

    expect(allTimeRect?.width).toBeGreaterThanOrEqual(60);
    expect(twelveMonthsRect?.width).toBeGreaterThanOrEqual(60);
    expect(twoYearsRect?.width).toBeGreaterThanOrEqual(60);
    expect(thisYearRect?.width).toBeGreaterThanOrEqual(60);
    expect(allTimeRect?.right).toBeLessThanOrEqual(twelveMonthsRect?.left ?? 0);
    expect(twelveMonthsRect?.right).toBeLessThanOrEqual(twoYearsRect?.left ?? 0);
    expect(twoYearsRect?.right).toBeLessThanOrEqual(thisYearRect?.left ?? 0);
    expect(search.getBoundingClientRect().bottom).toBeLessThanOrEqual(allTimeRect?.top ?? 0);
  });

  it("keeps disabled timeframe labels legible above their message at 1440 by 900", async () => {
    await page.viewport(1440, 900);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, games: [] }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const allTime = page.getByRole("radio", { name: "All time" }).element().parentElement;
    const twelveMonths = page.getByRole("radio", { name: "12 months" }).element().parentElement;
    const twoYears = page.getByRole("radio", { name: "2 years" }).element().parentElement;
    const thisYear = page.getByRole("radio", { name: "This year" }).element().parentElement;
    const search = page.getByRole("searchbox", { name: "Search games by name" }).element();
    const message = page.getByText("Filters become available after games are imported.").element();
    const allTimeRect = allTime?.getBoundingClientRect();
    const twelveMonthsRect = twelveMonths?.getBoundingClientRect();
    const twoYearsRect = twoYears?.getBoundingClientRect();
    const thisYearRect = thisYear?.getBoundingClientRect();

    expect(allTimeRect?.width).toBeGreaterThanOrEqual(60);
    expect(twelveMonthsRect?.width).toBeGreaterThanOrEqual(60);
    expect(twoYearsRect?.width).toBeGreaterThanOrEqual(60);
    expect(thisYearRect?.width).toBeGreaterThanOrEqual(60);
    expect(allTimeRect?.right).toBeLessThanOrEqual(twelveMonthsRect?.left ?? 0);
    expect(twelveMonthsRect?.right).toBeLessThanOrEqual(twoYearsRect?.left ?? 0);
    expect(twoYearsRect?.right).toBeLessThanOrEqual(thisYearRect?.left ?? 0);
    expect(message.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      Math.max(thisYearRect?.bottom ?? 900, search.getBoundingClientRect().bottom)
    );
  });

  it.each([
    [390, 844],
    [900, 800],
  ])(
    "retains Overview information without horizontal overflow at %i by %i",
    async (width, height) => {
      await page.viewport(width, height);
      onTestFinished(() => page.viewport(1280, 800));
      const { element } = createHarness(
        <DashboardView
          data={prototypeDashboard(demoDashboard)}
          onRefresh={vi.fn()}
          onSignOut={vi.fn()}
          signingOut={false}
        />
      );

      await render(element);

      await expect.element(page.getByText("Lifetime play")).toBeInTheDocument();
      await expect.element(page.getByText("Avg session", { exact: true })).toBeInTheDocument();
      expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
    }
  );

  it.each([
    [1440, 900, "purchase-history"],
    [390, 844, "data-controls"],
  ])("settles the %i by %i route surface at the cold %s hash", async (width, height, id) => {
    await page.viewport(width, height);
    window.history.replaceState(null, "", `#${id}`);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo(0, 0);
      return page.viewport(1280, 800);
    });
    const { element } = createHarness(
      <DashboardView
        data={prototypeDashboard(demoDashboard)}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const target = document.getElementById(id);

    expect(window.location.hash).toBe(`#${id}`);
    expect(target).not.toBeNull();
    await expect
      .element(
        page.getByText(id === "data-controls" ? "Data controls" : "Purchase history").first()
      )
      .toBeInViewport();
    expect(target?.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(target?.getBoundingClientRect().top).toBeLessThanOrEqual(100);
  });

  it("renders the selected demo profile and offers no unavailable account actions", async () => {
    const { element } = createHarness(<DashboardView data={demoDashboard} signingOut={false} />);

    await render(element);

    await expect
      .element(page.getByText("Deterministic demo data", { exact: true }).first())
      .toBeVisible();

    await page
      .getByRole("button", { name: /Switch account, current account PlayloomDemo/ })
      .click();

    await expect.element(page.getByRole("heading", { name: "Switch account" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "PlayloomDemo, current account" }))
      .toHaveAttribute("aria-current", "true");
    await expect.element(page.getByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("renders the selected imported profile and wires its account actions", async () => {
    const onSignOut = vi.fn();
    const { element } = createHarness(
      <DashboardView
        data={{
          ...demoDashboard,
          profile: {
            ...demoDashboard.profile,
            onlineId: "ImportedPlayer",
            avatarUrl: "/playloom/sample-psn-avatar.svg",
            sourceLabel: "Imported from PlayStation",
          },
          isDemo: false,
        }}
        onRefresh={vi.fn()}
        onSignOut={onSignOut}
        signingOut={false}
      />
    );

    await render(element);

    await expect
      .element(page.getByText("Imported from PlayStation", { exact: true }).first())
      .toBeVisible();
    await expect
      .element(page.getByRole("img", { name: "ImportedPlayer avatar" }).first())
      .toBeVisible();

    const refresh = page.getByRole("button", { name: "Refresh PlayStation data" });
    const signOut = page.getByRole("button", { name: "Sign out" });

    expect(refresh.element().closest('[data-slot="dashboard-shell-header"]')).not.toBeNull();
    expect(signOut.element().closest('[data-slot="dashboard-shell-header"]')).not.toBeNull();

    await signOut.click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("choosing a timeframe recomputes the scoped library", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect
      .element(page.getByRole("region", { name: "98 games in the Library" }))
      .toBeVisible();

    await expect.element(page.getByRole("radio", { name: "This year" })).toBeInTheDocument();

    await page.getByRole("radio", { name: "This year" }).click();

    await expect
      .element(page.getByRole("region", { name: /15 matching games.*98 titles/ }))
      .toBeVisible();
  });

  it("keeps Ask AI account-wide when game filters narrow the library", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const promptDocument = page.getByRole("article", { name: "Prompt preview" });

    await expect.element(promptDocument).toBeVisible();

    const countGames = () =>
      promptDocument
        .element()
        .textContent.split("\n")
        .filter((line) => /^ {2}\d+\. /.test(line)).length;

    const fullCount = countGames();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    await expect
      .element(page.getByRole("region", { name: /1 matching game.*98 titles/ }))
      .toBeVisible();

    expect(fullCount).toBe(demoDashboard.games.length);
    expect(countGames()).toBe(fullCount);
  });

  it("keeps the profile overlay anchored and restores focus at nonzero scroll", async () => {
    const { element } = createHarness(
      <div style={{ paddingTop: 600 }}>
        <DashboardView
          data={demoDashboard}
          onRefresh={vi.fn()}
          onSignOut={vi.fn()}
          signingOut={false}
        />
      </div>
    );
    await render(element);
    window.scrollTo(0, 240);

    expect(window.scrollY).toBe(240);

    const trigger = page.getByRole("button", { name: /Switch account, current account/ });
    const before = trigger.element().getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;

    await trigger.click();

    await expect.element(page.getByRole("dialog", { name: "Switch account" })).toBeVisible();

    const open = trigger.element().getBoundingClientRect();

    expect(open.x).toBe(before.x);
    expect(open.y).toBe(before.y);
    expect(document.documentElement.clientWidth).toBe(viewportWidth);

    await userEvent.keyboard("{Escape}");

    await expect.element(trigger).toHaveFocus();
    expect(window.scrollY).toBe(240);
    expect(document.documentElement.clientWidth).toBe(viewportWidth);
    expect(trigger.element().getBoundingClientRect().x).toBe(before.x);
  });

  it("focuses the connection heading after Add PlayStation account navigation", async () => {
    const dashboard = (
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );
    const { element } = createHarness(null, {
      path: "/dashboard",
      dashboard,
      index: <Connect />,
    });

    await render(element);
    await page.getByRole("button", { name: /Switch account, current account/ }).click();
    await page.getByRole("link", { name: "Add PlayStation account" }).click();

    const heading = page.getByRole("heading", { name: "Bring in your PlayStation history." });

    await expect.element(heading).toHaveFocus();
    await expect
      .element(page.getByRole("region", { name: "Bring in your PlayStation history." }))
      .toBeInViewport();
  });

  it.each([
    [1440, 900],
    [390, 844],
  ])(
    "retains the game filter and chapter when switching connected import sources at %i by %i",
    async (width, height) => {
      await page.viewport(width, height);
      const first = {
        ...demoDashboard,
        profile: {
          ...demoDashboard.profile,
          accountId: "acc-1",
          onlineId: "FirstAccount",
          avatarUrl: "/playloom/sample-psn-avatar.svg",
          sourceLabel: "Imported from PlayStation",
        },
        isDemo: false,
      };
      const fallbackProfile = {
        ...demoDashboard.profile,
        accountId: "acc-2",
        onlineId: "SecondAccount",
        sourceLabel: "Imported from PlayStation",
      };
      delete fallbackProfile.avatarUrl;
      const second = {
        ...demoDashboard,
        fetchedAt: "2025-06-01T00:00:00.000Z",
        profile: fallbackProfile,
        isDemo: false,
      };
      testDashboardStore.save(first);
      testDashboardStore.save(second);
      testDashboardStore.setActive(first.profile.accountId);
      window.history.replaceState(null, "", "#library");
      onTestFinished(() => {
        testDashboardStore.remove(first.profile.accountId);
        testDashboardStore.remove(second.profile.accountId);
        testDashboardStore.clearActive();
        window.history.replaceState(null, "", window.location.pathname);
        return page.viewport(1280, 800);
      });
      const { element } = createHarness(<ActiveDashboardView />);

      await render(element);
      const search = page.getByRole("searchbox", { name: "Search games by name" });
      await search.fill("Forza");

      await expect
        .element(page.getByRole("region", { name: /1 matching game.*98 titles/ }))
        .toBeVisible();

      await page
        .getByRole("button", { name: /Switch account, current account FirstAccount/ })
        .click();

      await expect
        .element(page.getByText("Imported from PlayStation", { exact: true }).first())
        .toBeVisible();

      await page.getByRole("button", { name: "Switch to SecondAccount" }).click();

      await expect.element(page.getByRole("heading", { name: "SecondAccount" })).toBeVisible();
      await expect.element(search).toHaveValue("Forza");
      expect(window.location.hash).toBe("#library");
      await expect
        .element(
          page.getByRole("button", { name: /Switch account, current account SecondAccount/ })
        )
        .toHaveFocus();
    }
  );

  it("switches from an imported account to demo data without losing the destination or filter", async () => {
    const imported = {
      ...demoDashboard,
      profile: {
        ...demoDashboard.profile,
        accountId: "acc-imported",
        onlineId: "ImportedPlayer",
        sourceLabel: "Imported from PlayStation",
      },
      games: [{ ...demoDashboard.games[0]!, name: "Grand Theft Imported Only" }],
      isDemo: false,
    };
    testDashboardStore.save(imported);
    testDashboardStore.setActive(imported.profile.accountId);
    window.history.replaceState(null, "", "#library");
    onTestFinished(() => {
      testDashboardStore.remove(imported.profile.accountId);
      testDashboardStore.clearActive();
      window.history.replaceState(null, "", window.location.pathname);
    });
    const { element } = createHarness(<ActiveDashboardView />);

    await render(element);
    const search = page.getByRole("searchbox", { name: "Search games by name" });
    await search.fill("Grand Theft");

    await expect
      .element(page.getByText("Grand Theft Imported Only", { exact: true }).first())
      .toBeVisible();

    await page
      .getByRole("button", { name: /Switch account, current account ImportedPlayer/ })
      .click();
    await page.getByRole("button", { name: "Switch to PlayloomDemo" }).click();

    await expect
      .element(page.getByRole("heading", { name: demoDashboard.profile.onlineId }))
      .toBeVisible();
    await expect
      .element(page.getByText("Grand Theft Imported Only", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByText("Grand Theft Auto V (PlayStation®5)", { exact: true }).first())
      .toBeVisible();
    await expect.element(search).toHaveValue("Grand Theft");
    expect(window.location.hash).toBe("#library");
    await expect
      .element(page.getByRole("button", { name: /current account PlayloomDemo/ }))
      .toHaveFocus();
  });

  it("keeps pruned facets removed across an account round trip", async () => {
    const source = {
      ...demoDashboard,
      profile: {
        ...demoDashboard.profile,
        accountId: "facet-source",
        onlineId: "FacetSource",
        sourceLabel: "Imported from PlayStation",
      },
      games: [
        {
          ...demoDashboard.games[0]!,
          name: "Grand Theft Source",
          genre: "Sports" as const,
          platform: "PS4" as const,
        },
      ],
      isDemo: false,
    };
    const destination = {
      ...demoDashboard,
      profile: {
        ...demoDashboard.profile,
        accountId: "facet-destination",
        onlineId: "FacetDestination",
        sourceLabel: "Imported from PlayStation",
      },
      games: [
        {
          ...demoDashboard.games[0]!,
          name: "Grand Theft Destination",
          genre: "RPG" as const,
          platform: "PS4" as const,
        },
      ],
      isDemo: false,
    };
    testDashboardStore.save(source);
    testDashboardStore.save(destination);
    testDashboardStore.setActive(source.profile.accountId);
    onTestFinished(() => {
      testDashboardStore.remove(source.profile.accountId);
      testDashboardStore.remove(destination.profile.accountId);
      testDashboardStore.clearActive();
    });
    const { element } = createHarness(<ActiveDashboardView />);

    await render(element);

    const search = page.getByRole("searchbox", { name: "Search games by name" });
    await search.fill("Grand Theft");
    await page.getByRole("button", { name: "Filter games" }).click();
    await page.getByRole("checkbox", { name: "Sports" }).click();
    await page.getByRole("checkbox", { name: "PS4" }).click();
    await page.getByRole("button", { name: "Done filtering" }).click();
    await page.getByRole("button", { name: /Switch account, current account FacetSource/ }).click();
    await page.getByRole("button", { name: "Switch to FacetDestination" }).click();

    await expect
      .element(page.getByText("Grand Theft Destination", { exact: true }).first())
      .toBeVisible();
    await expect.element(search).toHaveValue("Grand Theft");

    await page.getByRole("button", { name: /Filter games/ }).click();

    await expect.element(page.getByRole("checkbox", { name: "PS4" })).toBeChecked();
    await expect.element(page.getByRole("checkbox", { name: "Sports" })).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Done filtering" }).click();
    await page
      .getByRole("button", { name: /Switch account, current account FacetDestination/ })
      .click();
    await page.getByRole("button", { name: "Switch to FacetSource" }).click();

    await expect
      .element(page.getByText("Grand Theft Source", { exact: true }).first())
      .toBeVisible();
    await expect.element(search).toHaveValue("Grand Theft");
    await expect.element(page.getByText("No games match your filters")).not.toBeInTheDocument();

    await page.getByRole("button", { name: /Filter games/ }).click();

    await expect.element(page.getByRole("checkbox", { name: "PS4" })).toBeChecked();
    await expect.element(page.getByRole("checkbox", { name: "Sports" })).not.toBeChecked();
  });

  it("filters the direct purchase history by date and keeps every sortable column", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );
    await render(element);

    const history = document.getElementById("purchase-history");
    const historyText = () => history?.textContent ?? "";

    expect(historyText()).toContain("Grand Theft Auto V");

    await page.getByLabelText("Purchase date from").fill("2025-01-01");

    expect(historyText()).not.toContain("Grand Theft Auto V");

    const sortButtons = Array.from(
      history?.querySelectorAll<HTMLButtonElement>("thead button") ?? []
    );

    expect(sortButtons.map((button) => button.getAttribute("aria-label"))).toStrictEqual([
      "Sort by Date",
      "Sort by Product",
      "Sort by Amount paid",
      "Sort by Original",
      "Sort by Discount",
      "Sort by Type",
      "Sort by Match",
    ]);

    await page.getByRole("button", { name: "Sort by Product" }).click();
    const firstProduct = history?.querySelector("tbody tr td:nth-child(2)");

    expect(firstProduct?.textContent).toContain("Cyberpunk");
  });

  it("keeps account-wide spend totals when a filter narrows the library", async () => {
    // A real, signed-in account: spend joins to the library and is account-wide.
    testTransactionStore.save(demoDashboard.profile.accountId, {
      transactions: [baseFor("DEMO-8", 3000), baseFor("DEMO-6", 2000)],
      importedAt: "2024-01-01T00:00:00.000Z",
      source: "store.playstation.com",
    });
    onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));

    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, isDemo: false }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const spentMost = () => document.getElementById("spent-most")?.textContent ?? "";

    await expect
      .element(page.getByRole("region", { name: "98 games in the Library" }))
      .toBeVisible();

    // Satisfactory's £20 spend (DEMO-6) shows alongside the full library.
    expect(spentMost()).toContain("Satisfactory");
    expect(spentMost()).toContain("£20.00");

    // Filtering to Cyberpunk (DEMO-8) narrows the game-centric views off Satisfactory.
    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Cyberpunk");

    await expect
      .element(page.getByRole("region", { name: /1 matching game.*98 titles/ }))
      .toBeVisible();

    // …but spend stays account-wide: Satisfactory's £20 is still reported.
    expect(spentMost()).toContain("Satisfactory");
    expect(spentMost()).toContain("£20.00");
  });

  it("renders the empty state when the account has no played games", async () => {
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, games: [] }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("No PlayStation games found")).toBeVisible();
  });

  it("shows the no-matches state and restores the library when filters are cleared", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("zzzzzznomatch");

    await expect.element(page.getByText("No games match your filters")).toBeVisible();
    expect(document.getElementById("spending")).not.toBeNull();
    expect(document.getElementById("ask-ai")).not.toBeNull();
    expect(document.getElementById("data-controls")).not.toBeNull();
    expect(document.getElementById("library")).not.toBeNull();
    await expect.element(page.getByRole("link", { name: "Purchase history" })).toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect
      .element(page.getByRole("region", { name: "98 games in the Library" }))
      .toBeVisible();
  });

  it("disables timeframe radios with the other filters for an empty archive", async () => {
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, games: [] }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByRole("radio", { name: "All time" })).toBeDisabled();
    await expect.element(page.getByRole("radio", { name: "12 months" })).toBeDisabled();
    await expect.element(page.getByRole("radio", { name: "2 years" })).toBeDisabled();
    await expect.element(page.getByRole("radio", { name: "This year" })).toBeDisabled();
  });

  it("excludes a seeded transaction import from every partial archive consumer", async () => {
    const signedIn = { ...demoDashboard, isDemo: false };
    const seeded = {
      ...baseFor("DEMO-8", 987_654),
      productName: "Seeded private purchase",
      displayAmount: "£9,876.54",
    };
    testTransactionStore.save(signedIn.profile.accountId, {
      transactions: [seeded],
      importedAt: "2025-06-01T00:00:00.000Z",
      source: "store.playstation.com",
    });
    onTestFinished(() => testTransactionStore.clear(signedIn.profile.accountId));
    const { element } = createHarness(
      <DashboardView
        data={signedIn}
        partialData
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    const { container } = await render(element);
    const promptDocument = page.getByRole("article", { name: "Prompt preview" });

    await expect.element(promptDocument).toBeVisible();

    expect(container.textContent).not.toContain("Seeded private purchase");
    expect(container.textContent).not.toContain("£9,876.54");
    expect(promptDocument.element().textContent).not.toContain("Seeded private purchase");
    await expect
      .element(page.getByText("Remove imported transaction data"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Export transactions (CSV)" }))
      .toBeDisabled();
    expect(document.getElementById("purchase-history")?.textContent).toContain(
      "Purchase history rows are unavailable"
    );
    expect(document.getElementById("spent-most")?.textContent).toContain(
      "Most-spent rankings are unavailable"
    );
    expect(document.getElementById("add-ons")?.textContent).toContain(
      "Add-on purchase insights are unavailable"
    );
    expect(document.getElementById("purchase-data")?.textContent).toContain(
      "Purchase import controls are unavailable"
    );
    await expect
      .element(page.getByText("Purchase history rows are unavailable in this evaluation state."))
      .toBeVisible();
    await expect
      .element(page.getByText("Most-spent rankings are unavailable in this evaluation state."))
      .toBeVisible();
    await expect
      .element(page.getByText("Add-on purchase insights are unavailable in this evaluation state."))
      .toBeVisible();
    await expect
      .element(page.getByText("Purchase import controls are unavailable in this evaluation state."))
      .toBeVisible();
    await expect
      .element(page.getByText("Transaction data is unavailable in this evaluation state."))
      .toBeVisible();
  });

  it("renders fixture data at every demo purchase destination", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    expect(document.getElementById("purchase-history")?.textContent).toContain("Satisfactory");
    expect(document.getElementById("purchase-history")?.textContent).toContain("£32.99");
    expect(document.getElementById("spent-most")?.textContent).toContain("Cyberpunk 2077");
    expect(document.getElementById("spent-most")?.textContent).toContain("£44.98");
    expect(document.getElementById("add-ons")?.textContent).toContain("Cyberpunk 2077");
    expect(document.getElementById("add-ons")?.textContent).toContain("1 add-on");
  });

  it("explains every direct purchase destination when no transactions were imported", async () => {
    const signedIn = {
      ...demoDashboard,
      profile: { ...demoDashboard.profile, accountId: "no-purchases" },
      isDemo: false,
    };
    testTransactionStore.clear(signedIn.profile.accountId);
    const { element } = createHarness(
      <DashboardView data={signedIn} onRefresh={vi.fn()} onSignOut={vi.fn()} signingOut={false} />
    );

    await render(element);

    expect(document.getElementById("purchase-history")?.textContent).toContain(
      "No purchase history yet"
    );
    expect(document.getElementById("spent-most")?.textContent).toContain(
      "No most-spent ranking yet"
    );
    expect(document.getElementById("add-ons")?.textContent).toContain("No add-on purchases yet");
    expect(document.getElementById("purchase-data")?.textContent).toContain(
      "Import PlayStation purchases"
    );
    await expect.element(page.getByText("No purchase history yet")).toBeVisible();
    await expect.element(page.getByText("No most-spent ranking yet")).toBeVisible();
    await expect.element(page.getByText("No add-on purchases yet")).toBeVisible();
    await expect.element(page.getByText("Import PlayStation purchases")).toBeVisible();
  });

  it("keeps the search input responsive while the deferred filter settles", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    const searchbox = page.getByRole("searchbox", { name: "Search games by name" });
    await searchbox.fill("Forza");

    // The input reflects the typed term immediately (it stays bound to the live filters)…
    await expect.element(searchbox).toHaveValue("Forza");

    // …and the deferred re-filter eventually settles the scoped library to the matches.
    await expect
      .element(page.getByRole("region", { name: /1 matching game.*98 titles/ }))
      .toBeVisible();
  });

  it("searching by name narrows the scoped library", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect
      .element(page.getByRole("region", { name: "98 games in the Library" }))
      .toBeVisible();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    // Recompute narrows the result count while preserving the archive total.
    await expect
      .element(page.getByRole("region", { name: /1 matching game.*98 titles/ }))
      .toBeVisible();
  });
});
