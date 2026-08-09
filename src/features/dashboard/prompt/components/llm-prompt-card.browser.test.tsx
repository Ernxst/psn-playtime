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
  testTransactionStore.save(demoDashboard.profile.accountId, {
    transactions: [transaction],
    importedAt: "2024-01-01T00:00:00.000Z",
    source: "store.playstation.com",
  });
  onTestFinished(() => testTransactionStore.clear(demoDashboard.profile.accountId));
}

describe("LlmPromptCard", () => {
  it("renders the searchable question picker and a prompt preview", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByRole("region", { name: "Choose a question" })).toBeVisible();
    await expect.element(page.getByRole("searchbox", { name: "Search questions" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("article", { name: "Prompt preview" })).toBeVisible();
    await expect.element(page.getByText("Prompt ready")).toBeVisible();
    await expect
      .element(page.getByRole("textbox", { name: "Prompt preview" }))
      .not.toBeInTheDocument();
  });

  it("renders all four prompt actions alongside the preview without squashing them", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByRole("article", { name: "Prompt preview" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Download (.md)" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Open in ChatGPT" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Open in Claude" })).toBeVisible();
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
    await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("copies the prompt first, then opens ChatGPT in a new tab", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const open = vi.spyOn(window, "open").mockReturnValue(window);

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Open in ChatGPT" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("FOLLOW-UP QUESTIONS")
    );
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://chatgpt.com/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("copies the prompt first, then opens Claude in a new tab", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const open = vi.spyOn(window, "open").mockReturnValue(window);

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Open in Claude" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("FOLLOW-UP QUESTIONS")
    );
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://claude.ai/new",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does not open the tab and shows an inline error when the copy fails", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    const open = vi.spyOn(window, "open").mockReturnValue(window);

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Open in ChatGPT" }).click();

    await expect
      .element(page.getByText("Couldn't copy, click Copy prompt then open ChatGPT."))
      .toBeVisible();
    await expect
      .element(page.getByText("Prompt copied. Open ChatGPT and paste it in."))
      .not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps the user on the page with a copied message when the popup is blocked", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Open in ChatGPT" }).click();

    await expect
      .element(page.getByText("Prompt copied. Open ChatGPT and paste it in."))
      .toBeVisible();
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://chatgpt.com/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("captions each action group beneath its buttons", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await expect
      .element(page.getByText("Copy the full prompt to paste into any AI chat."))
      .toBeVisible();
    await expect
      .element(page.getByText("Opens the chat with your prompt copied. Just paste it in."))
      .toBeVisible();
    await expect
      .element(
        page.getByText(
          "Attach it in ChatGPT or Claude, best for very large prompts, or keep a copy."
        )
      )
      .toBeVisible();
  });

  it("saves the prompt to a Markdown file and revokes the object URL", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prompt");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const blob = vi.spyOn(globalThis, "Blob");

    await render(<LlmPromptCard data={demoDashboard} />);

    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockReturnValue();
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    await page.getByRole("button", { name: "Download (.md)" }).click();

    expect(blob).toHaveBeenCalledExactlyOnceWith([expect.stringContaining("FOLLOW-UP QUESTIONS")], {
      type: "text/markdown",
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveAttribute(
      "download",
      `psn-playtime-prompt-${demoDashboard.profile.onlineId}.md`
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:prompt");
  });

  it("strips unsafe characters from the PSN id in the download filename", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:prompt");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    const data = { ...demoDashboard, profile: { ...demoDashboard.profile, onlineId: "a/b ?c" } };

    await render(<LlmPromptCard data={data} />);

    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockReturnValue();
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    await page.getByRole("button", { name: "Download (.md)" }).click();

    expect(anchor).toHaveAttribute("download", "psn-playtime-prompt-abc.md");
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

  it("keeps every catalogue group discoverable without a collapsible form layout", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("region", { name: "More" })).toBeVisible();
  });

  it("selecting a question updates the prompt hint", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: SIGNATURE_QUESTION }).click();

    await expect.element(page.getByText(`Leads with “${SIGNATURE_QUESTION}”`)).toBeVisible();
  });

  it("selecting the pinned menu entry switches the hint to menu mode", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await page.getByRole("button", { name: "Start with a general analysis" }).click();

    await expect
      .element(page.getByText("The AI introduces what it can tell you", { exact: false }))
      .toBeVisible();
  });

  it("shows matching questions when searching", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await userEvent.fill(page.getByRole("searchbox", { name: "Search questions" }), "signature");

    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
  });

  it("restores the full catalogue when the search is cleared", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    const search = page.getByRole("searchbox", { name: "Search questions" });
    await userEvent.fill(search, "signature");

    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();

    await userEvent.clear(search);

    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
  });

  it("searching filters the question list", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await userEvent.fill(page.getByRole("searchbox", { name: "Search questions" }), "signature");

    await expect.element(page.getByRole("button", { name: SIGNATURE_QUESTION })).toBeVisible();
    await expect.element(page.getByRole("button", { name: LEAD_QUESTION })).not.toBeInTheDocument();
  });

  it("shows an explicit empty state when no questions match", async () => {
    await render(<LlmPromptCard data={demoDashboard} />);

    await userEvent.fill(
      page.getByRole("searchbox", { name: "Search questions" }),
      "no-question-matches-this"
    );

    await expect
      .element(page.getByText("No questions match “no-question-matches-this”."))
      .toBeVisible();
  });

  const MENU_OPTION = "Start with a general analysis";

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
