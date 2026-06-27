import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { LlmPromptCard } from "./llm-prompt-card";

const LEAD_QUESTION = "Which games gave me the most enjoyment relative to time played?";
const SIGNATURE_QUESTION =
  "What's my signature genre, and how dominant is it versus everything else?";

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the searchable question picker and a prompt preview", async () => {
  await render(<LlmPromptCard data={demoDashboard} />);

  await expect.element(page.getByText("Ask an AI about your playtime")).toBeVisible();
  await expect.element(page.getByRole("searchbox", { name: "Search questions" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).toBeVisible();
  await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();
});

test("copies the prompt leading with the default question plus follow-ups", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

  await render(<LlmPromptCard data={demoDashboard} />);

  await page.getByRole("button", { name: "Copy prompt" }).click();

  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("TASK: Work out which games gave me the most enjoyment")
  );
  expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("FOLLOW-UP QUESTIONS"));
});

test("choosing a different lead question changes the copied prompt", async () => {
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

  await render(<LlmPromptCard data={demoDashboard} />);

  await page.getByRole("button", { name: SIGNATURE_QUESTION }).click();
  await page.getByRole("button", { name: "Copy prompt" }).click();

  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("TASK: Tell me my signature genre")
  );
});

test("searching filters the question list", async () => {
  await render(<LlmPromptCard data={demoDashboard} />);

  await userEvent.fill(page.getByRole("searchbox", { name: "Search questions" }), "signature");

  await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
  await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).not.toBeInTheDocument();
});
