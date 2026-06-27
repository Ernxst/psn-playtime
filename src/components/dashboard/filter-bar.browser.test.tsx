import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { defaultFilters } from "@/lib/psn/analytics";
import { demoDashboard } from "@/lib/psn/mock";
import { FilterBar } from "./filter-bar";

test("opens the filter popover and reveals the facet controls when the trigger is clicked", async () => {
  await render(<FilterBar data={demoDashboard} filters={defaultFilters} onChange={() => {}} />);

  expect(page.getByText("Genre").query()).toBeNull();

  await page.getByRole("button", { name: "Filters" }).click();

  await expect.element(page.getByText("Genre")).toBeInTheDocument();
  await expect.element(page.getByText("Platform")).toBeInTheDocument();
});
