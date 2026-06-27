import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { Bookmarklet } from "./bookmarklet";

test("copies the npsso token to the clipboard when run on the ssocookie page", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const alert = vi.fn();
  const prompt = vi.fn();

  await render(<Bookmarklet />);

  const link = page.getByRole("link", { name: /grab my psn token/i });
  await expect.element(link).toBeInTheDocument();
  const body = (link.element().getAttribute("href") ?? "").replace(/^javascript:/, "");
  const location = { href: "https://ca.account.sony.com/api/v1/ssocookie" };

  // The snippet runs against page globals; inject stubs so we exercise its real
  // body without touching the test page or actually navigating.
  // oxlint-disable-next-line react-doctor/no-eval, no-implied-eval
  const run = new Function(
    "document",
    "navigator",
    "location",
    "alert",
    "prompt",
    `return ${body}`
  );
  await run(
    { body: { innerText: '{"npsso":"abc123def456"}' } },
    { clipboard: { writeText } },
    location,
    alert,
    prompt
  );

  expect(writeText).toHaveBeenCalledExactlyOnceWith("abc123def456");
  expect(alert).toHaveBeenCalledTimes(1);
  expect(location.href).toBe("https://ca.account.sony.com/api/v1/ssocookie");
});

test("navigates to the ssocookie page when run somewhere without the token", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const alert = vi.fn();
  const prompt = vi.fn();

  await render(<Bookmarklet />);

  const link = page.getByRole("link", { name: /grab my psn token/i });
  await expect.element(link).toBeInTheDocument();
  const body = (link.element().getAttribute("href") ?? "").replace(/^javascript:/, "");
  const location = { href: "https://www.playstation.com/" };

  // oxlint-disable-next-line react-doctor/no-eval, no-implied-eval
  const run = new Function(
    "document",
    "navigator",
    "location",
    "alert",
    "prompt",
    `return ${body}`
  );
  await run(
    { body: { innerText: "<html>not the token page</html>" } },
    { clipboard: { writeText } },
    location,
    alert,
    prompt
  );

  expect(location.href).toBe("https://ca.account.sony.com/api/v1/ssocookie");
  expect(writeText).not.toHaveBeenCalled();
});

test("renders a draggable bookmarklet whose href reads the npsso from the page DOM", async () => {
  await render(<Bookmarklet />);

  const link = page.getByRole("link", { name: /grab my psn token/i });
  await expect.element(link).toBeInTheDocument();

  const href = link.element().getAttribute("href") ?? "";

  expect(href).toMatch(/^javascript:/);
  expect(href).toContain("document.body.innerText");
  expect(href).toContain("npsso");
  expect(href).toContain("navigator.clipboard.writeText(npsso)");
});
