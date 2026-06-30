import type { ReactNode } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import type { TransactionRow } from "@/domain/transactions";
import { TestAtomProvider, testTransactionStore } from "@/test/atom-registry";
import { LlmPromptCard } from "./llm-prompt-card";

const LEAD_QUESTION = "Which games gave me the most enjoyment relative to time played?";
const SIGNATURE_QUESTION =
  "What's my signature genre, and how dominant is it versus everything else?";
const SPEND_QUESTION = "How has my spending on games changed over time?";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render under the atom provider so `useTransactionImport` shares the seeded registry. */
function renderWithAtoms(ui: ReactNode) {
  return render(ui, { wrapper: TestAtomProvider });
}

function seedTransaction() {
  const transaction: TransactionRow = {
    transactionId: "t1",
    key: "t1",
    date: "2023-01-01",
    transactionType: "PRODUCT_PURCHASE",
    kind: "purchase",
    productName: "FIFA 18",
    quantity: 1,
    amountMinor: 4499,
    currency: "£",
    displayAmount: "£44.99",
  };
  testTransactionStore.save({
    transactions: [transaction],
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(() => testTransactionStore.clear());
}

describe("LlmPromptCard", () => {
  it("renders the searchable question picker and a prompt preview", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByText("Ask an AI about your playtime")).toBeVisible();
    await expect.element(page.getByRole("searchbox", { name: "Search questions" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("textbox", { name: "Prompt preview" })).toBeVisible();
  });

  it("copies the prompt leading with the default question plus follow-ups", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("TASK: Work out which games gave me the most enjoyment")
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("FOLLOW-UP QUESTIONS")
    );
  });

  it("saves the prompt to a Markdown file and revokes the object URL", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prompt");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const blob = vi.spyOn(globalThis, "Blob");

    await render(<LlmPromptCard data={demoDashboard} />);

    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockReturnValue();
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    await page.getByRole("button", { name: "Save to file" }).click();

    expect(blob).toHaveBeenCalledExactlyOnceWith([expect.stringContaining("FOLLOW-UP QUESTIONS")], {
      type: "text/markdown",
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveAttribute("download", "psn-playtime-prompt.md");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:prompt");
  });

  it("choosing a different lead question changes the copied prompt", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: SIGNATURE_QUESTION }).click();
    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("TASK: Tell me my signature genre")
    );
  });

  it("searching filters the question list", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await userEvent.fill(page.getByRole("searchbox", { name: "Search questions" }), "signature");

    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).not.toBeInTheDocument();
  });

  const MENU_OPTION = "Let the AI ask me (no specific question)";

  it("choosing the menu option copies a no-lead menu prompt", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: MENU_OPTION }).click();
    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Don't analyse anything yet.")
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.not.stringContaining("TASK:"));
  });

  it("picking a question after the menu option restores a lead prompt", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: MENU_OPTION }).click();
    await page.getByRole("button", { name: SIGNATURE_QUESTION }).click();
    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("TASK: Tell me my signature genre")
    );
  });

  it("hides the spend questions from the picker when no transactions are imported", async () => {
    await renderWithAtoms(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: SPEND_QUESTION }))
      .not.toBeInTheDocument();
  });

  it("shows the spend questions in the picker once transactions are imported", async () => {
    seedTransaction();

    await renderWithAtoms(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByRole("button", { name: SPEND_QUESTION })).toBeVisible();
  });

  it("builds a spend-aware prompt when a spend question is selected", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    seedTransaction();

    await renderWithAtoms(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: SPEND_QUESTION }).click();
    await page.getByRole("button", { name: "Copy prompt" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("TASK: Using the imported spend block")
    );
  });
});
