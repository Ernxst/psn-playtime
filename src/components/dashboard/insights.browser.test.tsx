import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { AppsExcludedNote, LifespansCard, RecencyCard, ValueCard } from "./insights";

const withGames = (games: typeof demoDashboard.games) => ({ ...demoDashboard, games });

test("value card surfaces the per-game averages", async () => {
  await render(<ValueCard data={demoDashboard} />);

  await expect.element(page.getByText("What a game is worth to you")).toBeVisible();
  await expect.element(page.getByText("Hours per game")).toBeVisible();
  await expect.element(page.getByText("Sessions per game")).toBeVisible();
});

test("recency card splits active versus dormant games", async () => {
  await render(<RecencyCard data={demoDashboard} />);

  await expect.element(page.getByText("Still in rotation")).toBeVisible();
  await expect.element(page.getByText(/active/)).toBeVisible();
  await expect.element(page.getByText(/dormant/)).toBeVisible();
});

test("lifespans card ranks the games with the longest first-to-last span", async () => {
  await render(<LifespansCard data={demoDashboard} />);

  await expect.element(page.getByText("Kept coming back to")).toBeVisible();
});

test("lifespans card renders nothing when there are no games", async () => {
  await render(<LifespansCard data={withGames([])} />);

  expect(page.getByText("Kept coming back to").query()).toBeNull();
});

test("apps-excluded note lists the streaming hours kept out of the game stats", async () => {
  await render(<AppsExcludedNote data={demoDashboard} />);

  await expect.element(page.getByText("Not counted: streaming & apps")).toBeVisible();
  await expect.element(page.getByText("YouTube").first()).toBeVisible();
  await expect.element(page.getByText("Total excluded")).toBeVisible();
});

test("apps-excluded note renders nothing when no apps were excluded", async () => {
  const data = { ...demoDashboard, meta: { ...demoDashboard.meta, appsExcluded: [] } };
  await render(<AppsExcludedNote data={data} />);

  expect(page.getByText("Not counted: streaming & apps").query()).toBeNull();
});
