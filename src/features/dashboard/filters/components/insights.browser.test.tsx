import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GamePlay } from "@/server/providers/account/snapshot";
import * as Dashboard from "@/test/factories/dashboard";
import { AppsExcludedNote, ComebacksCard, LifespansCard, RecencyCard, ValueCard } from "./insights";

const withGames = (games: GamePlay[]) => Dashboard.data({ games });

describe("ValueCard", () => {
  it("value card surfaces the per-game averages", async () => {
    await render(<ValueCard data={Dashboard.data()} />);

    await expect.element(page.getByText("What a game is worth to you")).toBeVisible();
    await expect.element(page.getByText("Lifetime hours per game")).toBeVisible();
    await expect.element(page.getByText("Sessions per game")).toBeVisible();
  });
});

describe("RecencyCard", () => {
  it("recency card splits active versus dormant games", async () => {
    await render(<RecencyCard data={Dashboard.data()} />);

    await expect.element(page.getByText("Still in rotation")).toBeVisible();
    await expect.element(page.getByText(/active/)).toBeVisible();
    await expect.element(page.getByText(/dormant/)).toBeVisible();
  });

  it("recency card exposes the lifetime caveat as an accessible tooltip", async () => {
    await render(
      <TooltipProvider delay={0}>
        <RecencyCard data={Dashboard.data()} />
      </TooltipProvider>
    );

    await page
      .getByRole("button", { name: /lifetime/ })
      .first()
      .hover();

    await expect
      .element(page.getByText(/PSN can under-report or miss play time for some titles/))
      .toBeVisible();
  });
});

describe("LifespansCard", () => {
  it("lifespans card ranks the games with the longest first-to-last span", async () => {
    await render(<LifespansCard data={Dashboard.data()} />);

    await expect.element(page.getByText("Longest in rotation")).toBeVisible();
  });

  it("lifespans card renders nothing when there are no games", async () => {
    await render(<LifespansCard data={withGames([])} />);

    await expect.element(page.getByText("Longest in rotation")).not.toBeInTheDocument();
  });
});

describe("ComebacksCard", () => {
  it("comebacks card surfaces games returned to after long breaks with an honest proxy caption", async () => {
    await render(<ComebacksCard data={Dashboard.data()} />);

    await expect.element(page.getByText("Kept coming back to")).toBeVisible();
    await expect.element(page.getByText(/proxy/)).toBeVisible();
    await expect.element(page.getByText(/avg gap/).first()).toBeVisible();
  });

  it("comebacks card renders nothing when no game qualifies", async () => {
    await render(<ComebacksCard data={withGames([])} />);

    await expect.element(page.getByText("Kept coming back to")).not.toBeInTheDocument();
  });
});

describe("AppsExcludedNote", () => {
  it("apps-excluded note lists the streaming hours kept out of the game stats", async () => {
    await render(<AppsExcludedNote data={Dashboard.data()} />);

    await expect.element(page.getByText("Not counted: streaming & apps")).toBeVisible();
    await expect.element(page.getByText("YouTube").first()).toBeVisible();
    await expect.element(page.getByText("Total excluded")).toBeVisible();
  });

  it("apps-excluded note renders nothing when no apps were excluded", async () => {
    const data = { ...Dashboard.data(), meta: { ...Dashboard.data().meta, appsExcluded: [] } };
    await render(<AppsExcludedNote data={data} />);

    await expect.element(page.getByText("Not counted: streaming & apps")).not.toBeInTheDocument();
  });
});
