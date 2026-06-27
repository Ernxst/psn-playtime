import { page } from "@vitest/browser/context";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Bookmarklet } from "./bookmarklet";

test("renders a draggable bookmarklet whose href copies the npsso token", async () => {
  await render(<Bookmarklet />);

  const link = page.getByRole("link", { name: /grab my psn token/i });
  await expect.element(link).toBeInTheDocument();

  const href = link.element().getAttribute("href") ?? "";
  expect(href).toMatch(/^javascript:/);
  expect(href).toContain("https://ca.account.sony.com/api/v1/ssocookie");
  expect(href).toContain("navigator.clipboard.writeText(npsso)");
});
