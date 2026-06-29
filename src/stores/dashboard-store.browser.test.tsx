import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { useActiveDashboard } from "./dashboard-store";

const ACTIVE_KEY = "psn-playtime:dashboard-active";
const dataKey = (accountId: string): string => `psn-playtime:dashboard:${accountId}`;

function ActiveOnlineId() {
  const data = useActiveDashboard();
  return <p>{data?.profile.onlineId}</p>;
}

test("falls back to demo data when the active cached dashboard has an invalid shape", async () => {
  localStorage.setItem(ACTIVE_KEY, "demo");
  localStorage.setItem(dataKey("demo"), JSON.stringify({ profile: { accountId: "demo" } }));

  await render(<ActiveOnlineId />);

  await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();
});
