/* oxlint-disable test-contract/no-dom-selector -- These tests verify scroll geometry and DOM-bound hash destinations. */
import { describe, expect, it, onTestFinished } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createHarness } from "@/test/harness";
import { DashboardShellHeader } from "./dashboard-shell-header";
import { alignHashDestination, dashboardSectionIds, DashboardSidebar } from "./dashboard-sidebar";

function HashDestination({ id }: { id: string }) {
  return (
    <div style={{ minHeight: 1800, paddingTop: 1200 }}>
      <section id={id} aria-label={`${id} destination`} tabIndex={-1}>
        Destination
      </section>
    </div>
  );
}

function DashboardDocument() {
  return (
    <main>
      {dashboardSectionIds.map((id) => (
        <section key={id} id={id} aria-label={`${id} destination`} style={{ minHeight: 500 }}>
          {id}
        </section>
      ))}
    </main>
  );
}

describe("DashboardSidebar", () => {
  it("collapses, reopens and follows a destination from the desktop header", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo(0, 0);
      return page.viewport(1280, 800);
    });
    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
        <main>
          <DashboardShellHeader />
          <HashDestination id="purchase-data" />
        </main>
      </SidebarProvider>
    );

    await render(element);

    const toggle = page.getByRole("button", { name: "Toggle chapter navigation" });

    await expect.element(toggle).toBeVisible();

    toggle.element().focus();
    await userEvent.keyboard("{Enter}");

    const navigation = page.getByRole("navigation", { name: "Dashboard chapters" });

    await expect
      .poll(() => navigation.element().getBoundingClientRect().right)
      .toBeLessThanOrEqual(0);

    await expect.element(toggle).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => navigation.element().getBoundingClientRect().left)
      .toBeGreaterThanOrEqual(0);

    const destination = page.getByRole("link", { name: "Purchase import" });
    destination.element().focus();
    await userEvent.keyboard("{Enter}");

    expect(window.location.hash).toBe("#purchase-data");

    await expect.element(destination).toHaveAttribute("aria-current", "location");

    await expect
      .element(page.getByRole("region", { name: "purchase-data destination" }))
      .toBeInViewport();
  });

  it("keeps a warm fragment selected as its destination settles", async () => {
    await page.viewport(1280, 800);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo(0, 0);
      return page.viewport(1280, 800);
    });
    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
        <DashboardDocument />
      </SidebarProvider>
    );

    await render(element);

    window.location.hash = "#purchase-data";

    const destination = page.getByRole("link", { name: "Purchase import" });

    await expect.element(destination).toHaveAttribute("aria-current", "location");

    await expect
      .element(page.getByRole("region", { name: "purchase-data destination" }))
      .toBeInViewport();
  });

  it("keeps the scroll-follow destination visible inside the chapter navigation", async () => {
    await page.viewport(1280, 500);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo(0, 0);
      return page.viewport(1280, 800);
    });
    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
        <DashboardDocument />
      </SidebarProvider>
    );

    await render(element);

    const target = page.getByRole("region", { name: "purchase-data destination" });
    target.element().scrollIntoView();
    window.scrollBy(0, -74);

    const link = page.getByRole("link", { name: "Purchase import" });

    await expect.element(link).toHaveAttribute("aria-current", "location");

    const navigation = document.querySelector<HTMLElement>('[data-slot="sidebar-content"]')!;

    await expect
      .poll(() => link.element().getBoundingClientRect().top)
      .toBeGreaterThanOrEqual(navigation.getBoundingClientRect().top);

    await expect
      .poll(() => link.element().getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(navigation.getBoundingClientRect().bottom);
  });

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

  it("renders desktop chapter navigation at the md breakpoint", async () => {
    await page.viewport(768, 900);
    onTestFinished(() => page.viewport(1280, 800));

    const { element } = createHarness(
      <SidebarProvider>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);

    await expect
      .element(page.getByRole("navigation", { name: "Dashboard chapters" }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: "Overview" })).toBeVisible();
  });

  it.each(dashboardSectionIds)(
    "lands the desktop cold hash for %s at its sticky destination",
    async (id) => {
      await page.viewport(1280, 800);
      window.history.replaceState(null, "", `#${id}`);
      onTestFinished(() => {
        window.history.replaceState(null, "", window.location.pathname);
        window.scrollTo(0, 0);
        return page.viewport(1280, 800);
      });
      const { element } = createHarness(
        <SidebarProvider>
          <DashboardSidebar />
          <HashDestination id={id} />
        </SidebarProvider>
      );

      await render(element);
      alignHashDestination();

      await expect
        .element(page.getByRole("region", { name: `${id} destination` }))
        .toBeInViewport();
      expect(document.querySelector(`a[href="#${id}"]`)).toHaveAttribute(
        "aria-current",
        "location"
      );
    }
  );

  it.each(dashboardSectionIds)(
    "lands the mobile cold hash for %s and agrees with the drawer",
    async (id) => {
      await page.viewport(390, 844);
      window.history.replaceState(null, "", `#${id}`);
      onTestFinished(() => {
        window.history.replaceState(null, "", window.location.pathname);
        window.scrollTo(0, 0);
        return page.viewport(1280, 800);
      });
      const { element } = createHarness(
        <SidebarProvider>
          <SidebarTrigger />
          <DashboardSidebar />
          <HashDestination id={id} />
        </SidebarProvider>
      );

      await render(element);
      alignHashDestination();

      await expect
        .element(page.getByRole("region", { name: `${id} destination` }))
        .toBeInViewport();

      await page.getByRole("button", { name: "Toggle Sidebar" }).click();

      expect(document.querySelector(`a[href="#${id}"]`)).toHaveAttribute(
        "aria-current",
        "location"
      );
    }
  );

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

  it("restores mobile drawer scroll on dismissal and keeps destination navigation", async () => {
    await page.viewport(480, 800);
    onTestFinished(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo(0, 0);
      return page.viewport(1280, 800);
    });

    const { element } = createHarness(
      <SidebarProvider>
        <div style={{ minHeight: 2200, paddingTop: 400 }}>
          <SidebarTrigger />
          <section
            id="insights"
            aria-labelledby="insights-test-title"
            tabIndex={-1}
            style={{ marginTop: 1000 }}
          >
            <h2 id="insights-test-title">Insights destination</h2>
          </section>
        </div>
        <DashboardSidebar />
      </SidebarProvider>
    );

    await render(element);
    window.scrollTo(0, 300);

    const trigger = page.getByRole("button", { name: "Toggle Sidebar" });
    await trigger.click();

    await expect.element(page.getByRole("dialog", { name: "Navigate Playloom" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Close" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(window.scrollY).toBe(300);

    await expect.element(trigger).toHaveFocus();

    await trigger.click();
    await page.getByRole("link", { name: "Insights" }).click();

    expect(window.location.hash).toBe("#insights");
    expect(window.scrollY).toBeGreaterThan(800);
    await expect.element(page.getByRole("region", { name: "Insights destination" })).toHaveFocus();

    await trigger.click();

    await expect
      .element(page.getByRole("link", { name: "Insights" }))
      .toHaveAttribute("aria-current", "location");
  });
});
