import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { ChartCard } from "./chart-card";

test("chart card frames its children with a title and caption", async () => {
  await render(
    <ChartCard title="Top games by hours" caption="The titles you've sunk the most time into.">
      <p>chart goes here</p>
    </ChartCard>
  );

  await expect.element(page.getByText("Top games by hours")).toBeVisible();
  await expect.element(page.getByText("The titles you've sunk the most time into.")).toBeVisible();
  await expect.element(page.getByText("chart goes here")).toBeVisible();
});
