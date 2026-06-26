import { page } from "@vitest/browser/context";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { demoDashboard } from "@/lib/psn/mock";
import { KpiCards } from "./kpi-cards";

test("surfaces the headline trophy level and biggest game from the data", async () => {
  await render(<KpiCards data={demoDashboard} />);

  await expect.element(page.getByText("220")).toBeInTheDocument();
  await expect.element(page.getByText("Call of Duty®: Modern Warfare®")).toBeInTheDocument();
});
