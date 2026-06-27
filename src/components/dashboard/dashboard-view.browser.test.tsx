import { beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { createHarness } from "@/test/harness";
import { DashboardView } from "./dashboard-view";

// Give the chart surfaces a real size so Recharts renders inside the compose.
beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>[data-slot="chart"]{width:360px;height:300px}</style>`
  );
});

test("composes the header, KPIs, chart sections and games table from the data", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByRole("heading", { name: "Ernxst_" })).toBeVisible();
  await expect.element(page.getByText("Games played")).toBeVisible();
  await expect.element(page.getByText("Top games by hours")).toBeVisible();
  await expect.element(page.getByText("Every game you've played")).toBeVisible();
});

test("shows the demo banner for the demo dataset and offers no sign-out", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByText("demo dataset")).toBeVisible();
  expect(page.getByRole("button", { name: "Sign out" }).query()).toBeNull();
});

test("a signed-in dataset drops the demo banner and wires the sign-out button", async () => {
  const onSignOut = vi.fn();
  const { element } = createHarness(
    <DashboardView
      data={{ ...demoDashboard, isDemo: false }}
      onSignOut={onSignOut}
      signingOut={false}
    />
  );

  await render(element);

  expect(page.getByText("demo dataset").query()).toBeNull();

  await page.getByRole("button", { name: "Sign out" }).click();

  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test("choosing a timeframe recomputes the scoped library", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  // The games-table caption echoes the scoped title count — a stable recompute signal.
  await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

  await page.getByRole("tab", { name: "This year" }).click();

  await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
  await expect.element(page.getByText(/titles in total/)).toBeVisible();
});

test("narrowing the library narrows the AI prompt", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();

  const countGames = () =>
    (document.querySelector<HTMLTextAreaElement>('[aria-label="Prompt preview"]')?.value ?? "")
      .split("\n")
      .filter((line) => /^ {2}\d+\. /.test(line)).length;

  const fullCount = countGames();

  await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

  await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();

  expect(fullCount).toBe(demoDashboard.games.length);
  expect(countGames()).toBeLessThan(fullCount);
});

test("searching by name narrows the scoped library", async () => {
  const { element } = createHarness(
    <DashboardView data={demoDashboard} onSignOut={vi.fn()} signingOut={false} />
  );

  await render(element);

  await expect.element(page.getByText(/98 titles in total/)).toBeVisible();

  await page.getByRole("searchbox", { name: "Search games by name" }).fill("Forza");

  // Recompute drops the total to just the Forza matches.
  await expect.element(page.getByText(/98 titles in total/)).not.toBeInTheDocument();
  await expect.element(page.getByText(/titles in total/)).toBeVisible();
});
