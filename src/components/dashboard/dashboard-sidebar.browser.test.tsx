import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createHarness } from "@/test/harness";
import { DashboardSidebar } from "./dashboard-sidebar";

test("renders the section navigation and intercepts in-page nav clicks", async () => {
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

test("closes the mobile drawer after a section is chosen", async () => {
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

  const insightsLink = page.getByRole("link", { name: "Insights" });
  await expect.element(insightsLink).toBeVisible();

  await insightsLink.click();

  await expect.element(insightsLink).not.toBeInTheDocument();
});
