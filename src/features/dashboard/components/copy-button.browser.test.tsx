import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  it("writes the value to the clipboard and fires onCopy once when clicked", async () => {
    const onCopy = vi.fn();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<CopyButton value="hello world" label="Copy prompt" onCopy={onCopy} />);

    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith("hello world");
    expect(onCopy).toHaveBeenCalledExactlyOnceWith("hello world");
  });

  it("confirms the copy by swapping the label to Copied", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<CopyButton value="x" label="Copy prompt" />);

    await page.getByRole("button", { name: "Copy prompt" }).click();

    await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("renders an icon-only control labelled by its accessible name", async () => {
    await render(<CopyButton value="x" label="Copy prompt" variant="icon" />);

    await expect.element(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  });
});
