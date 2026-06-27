import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { createHarness } from "@/test/harness";
import { SecurityCallout } from "./security-callout";

test("security callout warns that the token is password-grade and links to the demo", async () => {
  const { element } = createHarness(<SecurityCallout />);

  await render(element);

  await expect
    .element(page.getByText("Your npsso token is like a password. Read this first."))
    .toBeVisible();
  await expect.element(page.getByText("full access to your PlayStation account")).toBeVisible();

  const demoLink = page.getByRole("link", { name: "demo" });
  await expect.element(demoLink).toHaveAttribute("href", "/dashboard");
});
