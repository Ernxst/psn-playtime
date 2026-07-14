import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createHarness } from "@/test/harness";
import { DashboardSidebar } from "./dashboard-sidebar";

describe("DashboardSidebar", () => {
  it("renders the section navigation and intercepts in-page nav clicks", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(1280, 800));

    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await expect.element(page.getByRole("link", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Top games" }).click();

    // handleNavigate calls preventDefault, so the hash never lands in the URL.
    expect(window.location.hash).toBe("");
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

  it("closes the mobile drawer after a section is chosen", async () => {
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

    const profileLink = page.getByRole("link", { name: "Play profile" });
    await expect.element(profileLink).toBeVisible();

    await profileLink.click();

    await expect.element(profileLink).not.toBeInTheDocument();
  });
});
