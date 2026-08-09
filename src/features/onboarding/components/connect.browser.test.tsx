import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { createHarness } from "@/test/harness";
import { Connect } from "./connect";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

describe("Connect", () => {
  it("keeps credentials hidden until the secondary connection task is opened", async () => {
    const { element } = createHarness(<Connect />);

    await render(element);

    await expect
      .element(page.getByRole("heading", { name: /bring in your playstation/i }))
      .toBeVisible();
    await expect.element(page.getByLabelText("NPSSO token")).not.toBeVisible();

    await page.getByText("Show connection", { exact: true }).click();

    await expect.element(page.getByLabelText("NPSSO token")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Connect PlayStation" })).toBeVisible();
  });

  it.each([
    [1024, 768],
    [390, 844],
  ])("keeps the connection task contained at %i by %i", async (width, height) => {
    await page.viewport(width, height);
    onTestFinished(() => page.viewport(1280, 800));

    const { element } = createHarness(<Connect />);
    await render(element);

    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  });
});
