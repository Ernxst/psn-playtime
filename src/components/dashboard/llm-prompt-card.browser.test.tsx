import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { LlmPromptCard } from "./llm-prompt-card";

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the question selector and a prompt preview", async () => {
  await render(<LlmPromptCard data={demoDashboard} />);

  await expect.element(page.getByText("Ask an AI about your playtime")).toBeVisible();
  await expect.element(page.getByRole("tab", { name: "What do I play the most?" })).toBeVisible();
  await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();
});

test("copies the prompt for the selected question to the clipboard", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

  await render(<LlmPromptCard data={demoDashboard} />);

  await page.getByRole("button", { name: "Copy prompt" }).click();

  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Tell me what I play the most"));
});

test("changing the selected question changes the copied prompt", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

  await render(<LlmPromptCard data={demoDashboard} />);

  await page.getByRole("tab", { name: "What should I play next?" }).click();
  await page.getByRole("button", { name: "Copy prompt" }).click();

  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("Recommend what I should play next")
  );
});
