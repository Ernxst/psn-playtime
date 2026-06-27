import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/lib/psn/mock";
import { GamesTable } from "./games-table";

test("lists played game names from the data", async () => {
  await render(<GamesTable data={demoDashboard} />);

  await expect.element(page.getByText("Every game you've played")).toBeInTheDocument();
  await expect.element(page.getByText("Forza Horizon 5")).toBeInTheDocument();
  await expect.element(page.getByText("Satisfactory")).toBeInTheDocument();
});
