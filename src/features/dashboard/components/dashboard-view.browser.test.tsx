import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import { prototypeDashboard } from "@/features/prototype/prototype-data";
import { testDashboardStore, testTransactionStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { DashboardView } from "./dashboard-view";

function textareaValue(element: Element): string {
  if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected a textarea");
  return element.value;
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
  it("composes the header, KPIs, chart sections and games table from the data", async () => {
    const data = prototypeDashboard(demoDashboard);
    const { element } = createHarness(
      <DashboardView data={data} onRefresh={vi.fn()} onSignOut={vi.fn()} signingOut={false} />
    );

    const { container } = await render(element);

    await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
    const overview = document.querySelector("#overview")?.textContent ?? "";
    expect(overview).toContain("Lifetime play");
    expect(overview).toContain("Games played");
    expect(overview).toContain("Sessions");
    expect(overview).toContain("Avg per game");
    expect(overview).toContain("Avg session");
    expect(overview).not.toContain("Trophy level");
    expect(container.querySelectorAll('[data-source="psn"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-source="rawg-fixture"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-source="deterministic"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-source="psn"] .playloom-poster-psn')).not.toBeNull();

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

    const { container } = await render(element);

    const overview = container.querySelector<HTMLElement>("#overview");
    const metrics = overview?.querySelectorAll<HTMLElement>("strong") ?? [];

    expect(container.querySelectorAll("main").length).toBe(1);
    expect(overview?.textContent).toContain("Lifetime play");
    expect(overview?.textContent).toContain("Games played");
    expect(overview?.textContent).toContain("Sessions");
    expect(overview?.textContent).toContain("Avg per game");
    expect(overview?.textContent).toContain("Avg session");
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    expect(metrics[metrics.length - 1]?.getBoundingClientRect().bottom).toBeLessThanOrEqual(900);
    await expect.element(page.getByText("Lifetime-hours caveat.")).toBeVisible();
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

  it("shows the demo banner for the demo dataset and offers no sign-out", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("demo dataset")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("a signed-in dataset drops the demo banner and wires the sign-out button", async () => {
    const onSignOut = vi.fn();
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, isDemo: false }}
        onRefresh={vi.fn()}
        onSignOut={onSignOut}
        signingOut={false}
      />
    );

    await render(element);

    await expect.element(page.getByText("demo dataset")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Sign out" }).click();

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

    // The games-table caption echoes the scoped title count — a stable recompute signal.
    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    await expect.element(page.getByRole("radio", { name: "This year" })).toBeInTheDocument();
    await page.getByText("This year", { exact: true }).click();

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
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

    await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();

    const countGames = () =>
      textareaValue(page.getByRole("textbox", { name: "Prompt preview" }).element())
        .split("\n")
        .filter((line) => /^ {2}\d+\. /.test(line)).length;

    const fullCount = countGames();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

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
    const trigger = page.getByRole("button", { name: /Open profile menu/ });
    const before = trigger.element().getBoundingClientRect();

    await trigger.click();
    await expect.element(page.getByRole("dialog", { name: "Ernxst_" })).toBeVisible();

    const open = trigger.element().getBoundingClientRect();
    expect(open.x).toBe(before.x);
    expect(open.y).toBe(before.y);

    await userEvent.keyboard("{Escape}");

    await expect.element(trigger).toHaveFocus();
    expect(window.scrollY).toBe(240);
  });

  it("targets the existing PlayStation connection task when adding an account", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);
    await page.getByRole("button", { name: /Open profile menu/ }).click();

    await expect
      .element(page.getByRole("link", { name: "Add PlayStation account" }))
      .toHaveAttribute("href", "/#connect");
  });

  it("switches connected import sources through the profile control", async () => {
    const second = {
      ...demoDashboard,
      fetchedAt: "2025-06-01T00:00:00.000Z",
      profile: { ...demoDashboard.profile, accountId: "acc-2", onlineId: "SecondAccount" },
      isDemo: false,
    };
    testDashboardStore.save(second);
    const setActive = vi.spyOn(testDashboardStore, "setActive");
    onTestFinished(() => {
      setActive.mockRestore();
      testDashboardStore.remove(second.profile.accountId);
    });
    const { element } = createHarness(
      <DashboardView
        data={{ ...demoDashboard, isDemo: false }}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );

    await render(element);
    await page.getByRole("button", { name: /Open profile menu/ }).click();
    await page.getByRole("button", { name: "Switch to SecondAccount" }).click();

    expect(setActive).toHaveBeenCalledWith("acc-2");
  });

  it("filters the purchase ledger by date and sorts every retained column", async () => {
    const { element } = createHarness(
      <DashboardView
        data={demoDashboard}
        onRefresh={vi.fn()}
        onSignOut={vi.fn()}
        signingOut={false}
      />
    );
    const { container } = await render(element);

    const ledgerText = () => container.querySelector(".playloom-ledger")?.textContent ?? "";
    expect(ledgerText()).toContain("Grand Theft Auto V");

    await page.getByLabelText("Purchase date from").fill("2025-01-01");
    expect(ledgerText()).not.toContain("Grand Theft Auto V");

    const sortButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".playloom-ledger th button")
    );
    expect(sortButtons.map((button) => button.textContent?.trim())).toEqual([
      "Date ↓",
      "Product ↕",
      "Type ↕",
      "Match ↕",
      "Original ↕",
      "Discount ↕",
      "Paid ↕",
    ]);
    await page.getByRole("button", { name: "Product ↕" }).click();
    const firstProduct = container.querySelector(".playloom-ledger tbody tr td:nth-child(2)");
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

    // The "Spent the most on" section is account-wide; scope spend reads to it.
    const spentMost = () =>
      // The section has no accessible name; the contract here is its structural scope.
      // oxlint-disable-next-line test-contract/no-dom-selector
      page.getByText("Spent the most on").element().closest("section")?.textContent ?? "";

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    // Satisfactory's £20 spend (DEMO-6) shows alongside the full library.
    expect(spentMost()).toContain("Satisfactory");
    expect(spentMost()).toContain("£20.00");

    // Filtering to Cyberpunk (DEMO-8) narrows the game-centric views off Satisfactory.
    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Cyberpunk");

    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

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

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();
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

  it("keeps partial and signed-in archives free of demo purchase transactions", async () => {
    const signedIn = { ...demoDashboard, isDemo: false };
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
    const spending = container.querySelector("#spending")?.textContent ?? "";

    expect(spending).toContain("Purchase transactions unavailable");
    expect(spending).not.toContain("£155.95");
    expect(spending).not.toContain("Wallet top-ups: £50.00");
    expect(document.getElementById("purchase-history")).not.toBeNull();
    expect(document.getElementById("spent-most")).not.toBeNull();
    expect(document.getElementById("add-ons")).not.toBeNull();
    expect(document.getElementById("data-controls")).not.toBeNull();
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
    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
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

    await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

    await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

    // Recompute drops the total to just the Forza matches.
    await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
    await expect.element(page.getByText(/titles in total/)).toBeVisible();
  });
});
