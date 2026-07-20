import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createHarness } from "@/test/harness";
import { DashboardSidebar } from "./dashboard-sidebar";

describe("DashboardSidebar", () => {
  it("updates the URL hash when a section anchor is chosen", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      return page.viewport(1280, 800);
    });

    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await expect.element(page.getByRole("link", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Top games" }).click();

    expect(window.location.hash).toBe("#top-games");
  });

  it("marks the overview section active on first render", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(1280, 800));

    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await expect
      .element(page.getByRole("link", { name: "Overview" }))
      .toHaveAttribute("data-active", "true");
    await expect
      .element(page.getByRole("link", { name: "Top games" }))
      .toHaveAttribute("data-active", "false");
  });

  it("exposes every direct Spending destination", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(1280, 800));
    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await expect.element(page.getByRole("link", { name: "Purchase history" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Most spent" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Add-ons" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Purchase import" })).toBeVisible();
  });

  it("names and closes the scrollable mobile chapter drawer", async () => {
    await page.viewport(480, 800);
    onTestFinished(() => page.viewport(1280, 800));

    const { element } = createHarness(
      <SidebarProvider>
        <SidebarTrigger />
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();

    await expect.element(page.getByRole("dialog", { name: "Navigate Playloom" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Close" })).toBeVisible();
    const insightsLink = page.getByRole("link", { name: "Insights" });

    await expect.element(insightsLink).toBeVisible();

    await insightsLink.click();

    await expect.element(insightsLink).not.toBeInTheDocument();
  });
});
