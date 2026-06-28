/**
 * Client-side cache of dashboard data, keyed by PSN account.
 *
 * The npsso token is needed ONLY to fetch an account the first time; the derived
 * (non-secret) `DashboardData` is then persisted in `localStorage` so revisits
 * render from the cache with no token. An "active account" pointer records which
 * cached account the dashboard currently shows. Mirrors `transactions-store`:
 * same-tab writes notify via a custom event, and a `useSyncExternalStore` hook
 * re-renders subscribers when the cache changes.
 *
 * No TTL, no refresh, no clear UI: clearing is a manual browser-storage action.
 */
import { useSyncExternalStore } from "react";
import { demoDashboard } from "./psn/mock";
import type { DashboardData } from "./psn/types";

/** One cache entry per account: `psn-playtime:dashboard:<accountId>`. */
const KEY_PREFIX = "psn-playtime:dashboard:";

/** Pointer to the account the dashboard currently renders. */
const ACTIVE_KEY = "psn-playtime:dashboard-active";

/** Fired on the same tab after a write (the `storage` event only fires cross-tab). */
const STORE_EVENT = "psn-playtime:dashboard-changed";

/** Lightweight account identity used to drive the onboarding selector. */
export interface CachedAccount {
  accountId: string;
  onlineId: string;
  avatarUrl?: string;
  fetchedAt: string;
}

function dataKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

function parse(raw: string | null): DashboardData | null {
  if (raw === null) return null;
  try {
    // The persisted JSON is data we wrote ourselves; its type is the contract.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return JSON.parse(raw) as DashboardData;
  } catch {
    return null;
  }
}

/** Read one account's cached dashboard, or `null` when absent/corrupt/SSR. */
export function loadDashboard(accountId: string): DashboardData | null {
  if (typeof window === "undefined") return null;
  return parse(window.localStorage.getItem(dataKey(accountId)));
}

/** Persist an account's dashboard and notify same-tab subscribers. */
export function saveDashboard(data: DashboardData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(dataKey(data.profile.accountId), JSON.stringify(data));
  window.dispatchEvent(new Event(STORE_EVENT));
}

/** Mark an account as the one the dashboard should render. */
export function setActiveAccount(accountId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, accountId);
  window.dispatchEvent(new Event(STORE_EVENT));
}

/** Drop the active-account pointer so the dashboard falls back to demo data. */
export function clearActiveAccount(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(STORE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Cache the active snapshot keyed on `<activeId>:<raw>` so `getSnapshot` returns
// a stable reference between renders (required by `useSyncExternalStore`).
let activeCacheKey: string | null = null;
let activeCacheValue: DashboardData = demoDashboard;

function readActive(): DashboardData {
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  const raw = activeId === null ? null : window.localStorage.getItem(dataKey(activeId));
  const cacheKey = `${activeId ?? ""}:${raw ?? ""}`;
  if (cacheKey === activeCacheKey) return activeCacheValue;
  activeCacheKey = cacheKey;
  activeCacheValue = parse(raw) ?? demoDashboard;
  return activeCacheValue;
}

/**
 * The active account's cached dashboard, the demo dataset when none is active,
 * or `undefined` on the server and the initial client render (so the route can
 * show a shell until hydration reads `localStorage`).
 */
export function useActiveDashboard(): DashboardData | undefined {
  return useSyncExternalStore(subscribe, readActive, () => undefined);
}

const EMPTY_ACCOUNTS: CachedAccount[] = [];

// Cache the accounts snapshot keyed on a signature of the entries so repeated
// `getSnapshot` calls return a stable reference.
let accountsCacheKey: string | null = null;
let accountsCacheValue: CachedAccount[] = EMPTY_ACCOUNTS;

function toCachedAccount(key: string): CachedAccount | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const data = parse(window.localStorage.getItem(key));
  if (data === null) return null;
  return {
    accountId: data.profile.accountId,
    onlineId: data.profile.onlineId,
    avatarUrl: data.profile.avatarUrl,
    fetchedAt: data.fetchedAt,
  };
}

function collectAccounts(): CachedAccount[] {
  const accounts: CachedAccount[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    const account = key === null ? null : toCachedAccount(key);
    if (account) accounts.push(account);
  }
  accounts.sort((a, b) => a.onlineId.localeCompare(b.onlineId));
  return accounts;
}

function readAccounts(): CachedAccount[] {
  const accounts = collectAccounts();
  const signature = JSON.stringify(accounts);
  if (signature === accountsCacheKey) return accountsCacheValue;
  accountsCacheKey = signature;
  accountsCacheValue = accounts;
  return accounts;
}

/** The accounts with a cached dashboard entry; empty on the server. */
export function useCachedAccounts(): CachedAccount[] {
  return useSyncExternalStore(subscribe, readAccounts, () => EMPTY_ACCOUNTS);
}
