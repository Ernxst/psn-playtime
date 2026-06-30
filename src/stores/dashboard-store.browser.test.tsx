import { scheduleTask } from "@effect/atom-react";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { demoDashboard } from "@/domain/mock";
import { EffectAtomProvider } from "@/runtime/provider.effect";
import type { DashboardData } from "@/server/providers/account/snapshot";
import {
  type CachedAccount,
  type DashboardStore,
  makeDashboardStore,
  useActiveDashboard,
  useCachedAccounts,
} from "./dashboard-store";

const accountA: DashboardData = {
  ...demoDashboard,
  profile: { ...demoDashboard.profile, accountId: "acc-1", onlineId: "Aaron" },
};
const accountZ: DashboardData = {
  ...demoDashboard,
  profile: { ...demoDashboard.profile, accountId: "acc-2", onlineId: "Zoe" },
};

// A fresh registry (and a provider bound to it) per test isolates the dashboards
// record between tests — the store has no clear-all surface by design, so each
// test gets its own registry rather than resetting a shared one.
let registry: AtomRegistry.AtomRegistry;
let store: DashboardStore;

beforeEach(() => {
  localStorage.clear();
  registry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
  store = makeDashboardStore(registry);
});

function Provider({ children }: { readonly children: React.ReactNode }) {
  return <EffectAtomProvider registry={registry}>{children}</EffectAtomProvider>;
}

function ActiveOnlineId() {
  const data = useActiveDashboard();
  return <p>{data.profile.onlineId}</p>;
}

function CachedAccountNames() {
  const accounts = useCachedAccounts();
  return <p>{accounts.map((account) => account.onlineId).join(",") || "none"}</p>;
}

describe(".useActiveDashboard", () => {
  it("falls back to demo data when no account is active", async () => {
    await render(<ActiveOnlineId />, { wrapper: Provider });

    await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();
  });

  it("re-renders with the active account's cached dashboard after the store sets it active", async () => {
    store.save(accountA);

    await render(<ActiveOnlineId />, { wrapper: Provider });
    await expect.element(page.getByText(demoDashboard.profile.onlineId)).toBeVisible();

    store.setActive("acc-1");

    await expect.element(page.getByText("Aaron")).toBeVisible();
  });
});

describe(".useCachedAccounts", () => {
  it("re-renders with a newly cached account after a store save", async () => {
    await render(<CachedAccountNames />, { wrapper: Provider });
    await expect.element(page.getByText("none")).toBeVisible();

    store.save(accountA);

    await expect.element(page.getByText("Aaron")).toBeVisible();
  });

  it("lists cached accounts sorted by online id", async () => {
    store.save(accountZ);
    store.save(accountA);

    await render(<CachedAccountNames />, { wrapper: Provider });

    await expect.element(page.getByText("Aaron,Zoe")).toBeVisible();
  });

  it("keeps a stable snapshot reference across re-renders that do not change the store", async () => {
    store.save(accountA);
    const refs: CachedAccount[][] = [];

    function Probe() {
      refs.push(useCachedAccounts());
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      return (
        <button type="button" onClick={rerender}>
          Re-render
        </button>
      );
    }

    await render(<Probe />, { wrapper: Provider });
    await expect.element(page.getByRole("button", { name: "Re-render" })).toBeVisible();
    await vi.waitFor(() => expect(refs.at(-1)).toHaveLength(1));

    const stable = refs.at(-1);
    await page.getByRole("button", { name: "Re-render" }).click();
    await page.getByRole("button", { name: "Re-render" }).click();

    expect(refs.at(-1)).toBe(stable);
  });
});
