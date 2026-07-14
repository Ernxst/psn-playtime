import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { ProfileSummary } from "./profile-summary";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfileSummary", () => {
  it("renders one factual profile surface", async () => {
    await render(<ProfileSummary data={demoDashboard} />);

    await expect.element(page.getByText(/Your centre of gravity is/)).toBeVisible();
    await expect.element(page.getByText(/longest recorded span/)).toBeVisible();
    await expect.element(page.getByText(/matched trophy data covers/)).toBeVisible();
    await expect
      .element(page.getByText(/completion-focused|sampler|personality/))
      .not.toBeInTheDocument();
  });

  it("copies the same concise summary shown in the surface", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await render(<ProfileSummary data={demoDashboard} />);

    const visibleSentences = [
      page.getByText(/Your centre of gravity is/).element().textContent,
      page.getByText(/longest recorded span/).element().textContent,
      page.getByText(/matched trophy data covers/).element().textContent,
    ];
    await page.getByRole("button", { name: "Copy profile summary" }).click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(visibleSentences.join("\n\n"));
  });
});
