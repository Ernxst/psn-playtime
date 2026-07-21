import { useAtomValue } from "@effect/atom-react";
/**
 * Client-side cache of dashboard data, keyed by PSN account.
 *
 * The npsso token is used transiently for the initial fetch and any manual
 * refresh; the derived (non-secret) `DashboardData` is persisted in
 * `localStorage` so revisits render from the cache with no token. An "active
 * account" pointer records which cached account the dashboard currently shows.
 *
 * Persistence lives on the same Effect/Atom boundary as `transactions-store`:
 * two `Atom.kvs` nodes over the per-request {@link AtomRegistry} (a record of
 * dashboards keyed by account id, plus the active-account pointer). Imperative
 * writes go through {@link makeDashboardStore} — a plain service built per
 * request in `getContext` — and React reads go through {@link useActiveDashboard}
 * / {@link useCachedAccounts}, both backed by the same registry. Derived reads
 * use `Atom.map` / `Atom.make`, which memoise on input identity, so consumers
 * keep a stable snapshot reference between renders (no `useSyncExternalStore`,
 * no custom storage events, no module-level memo).
 *
 * There is no TTL or automatic refresh. A manual refresh requires a fresh token.
 *
 * Cross-tab `storage`-event sync is intentionally not provided; same-tab writes
 * notify subscribers through the shared registry.
 */
import * as Schema from "effect/Schema";
import * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { demoDashboard } from "@/domain/mock";
import { kvsRuntime } from "@/runtime/kvs.effect";
import { DashboardData } from "@/server/providers/account/snapshot";

/** All cached dashboards, keyed by account id, under one `localStorage` slot. */
const DASHBOARDS_STORAGE_KEY = "psn-playtime:dashboards";

/** Pointer to the account the dashboard currently renders. */
const ACTIVE_STORAGE_KEY = "psn-playtime:dashboard-active";

/** Lightweight account identity used to drive the onboarding selector. */
export interface CachedAccount {
  accountId: string;
  onlineId: string;
  avatarUrl?: string;
  avatarLabel: string;
  sourceLabel: string;
  fetchedAt: string;
}

/**
 * The persisted dashboards shape: a record of valid `DashboardData` keyed by
 * account id. The kvs schema decodes the whole record on read and encodes it on
 * write, so a malformed/decoded-away slot resolves to the `{}` default rather
 * than throwing.
 *
 * `mode: "sync"` (not "async") because `localStorage` is synchronous and we want
 * the atom's value to BE the record. Under `"async"` the read type becomes an
 * `AsyncResult`, so a post-write read no longer looks like a `Success` and
 * reactivity breaks; sync mode keeps reads and writes on the same plain type.
 *
 * SSR-safe: on the server the atom resolves to its `defaultValue` and never
 * touches `localStorage` (the `kvsRuntime` `layerStorage` thunk defers the
 * `globalThis.localStorage` access until a read actually happens on the client).
 */
const dashboardsAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: DASHBOARDS_STORAGE_KEY,
  schema: Schema.Record(Schema.String, DashboardData),
  defaultValue: (): Record<string, DashboardData> => ({}),
  mode: "sync",
});

/**
 * `localStorage`-backed pointer to the active account, or `null` when none is
 * active (the dashboard then falls back to the demo dataset). Same `sync`-mode
 * and SSR rationale as {@link dashboardsAtom}.
 */
const activeAccountIdAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: ACTIVE_STORAGE_KEY,
  schema: Schema.NullOr(Schema.String),
  defaultValue: (): string | null => null,
  mode: "sync",
});

function toCachedAccount(data: DashboardData): CachedAccount {
  const sourceLabel = data.profile.sourceLabel ?? "Imported from PlayStation";
  const avatarLabel = data.profile.avatarUrl
    ? sourceLabel === "Deterministic demo data"
      ? "Demo avatar"
      : "PSN avatar"
    : "Initials fallback";
  return {
    accountId: data.profile.accountId,
    onlineId: data.profile.onlineId,
    avatarUrl: data.profile.avatarUrl,
    avatarLabel,
    sourceLabel,
    fetchedAt: data.fetchedAt,
  };
}

/**
 * The active account's cached dashboard, or the demo dataset when no account is
 * active (or the active account has no cached entry). Derived with `Atom.make`,
 * which recomputes only when one of the source atoms actually changes — so a
 * plain re-render returns the memoised snapshot by reference and consumers do
 * not re-render in a loop.
 *
 * On the server (and the initial client render, before the kvs read resolves)
 * both sources hold their defaults, so this resolves to {@link demoDashboard} —
 * SSR and the first client render agree, avoiding a hydration mismatch.
 */
const activeDashboardAtom = Atom.make((get): DashboardData => {
  const dashboards = get(dashboardsAtom);
  const activeId = get(activeAccountIdAtom);
  if (activeId === null) return demoDashboard;
  return dashboards[activeId] ?? demoDashboard;
});

/**
 * The accounts with a cached dashboard entry, sorted by online id. Derived with
 * `Atom.map`, which memoises on {@link dashboardsAtom}'s identity, so the array
 * keeps a stable reference until a write changes the record — empty on the
 * server and until the first kvs read resolves.
 */
function cachedImportedAccounts(dashboards: Record<string, DashboardData>): CachedAccount[] {
  const accounts = Object.values(dashboards).reduce<CachedAccount[]>((result, data) => {
    if (data.profile.accountId !== demoDashboard.profile.accountId)
      result.push(toCachedAccount(data));
    return result;
  }, []);
  return accounts.sort((a, b) => a.onlineId.localeCompare(b.onlineId));
}

const cachedAccountsAtom = Atom.map(dashboardsAtom, cachedImportedAccounts);

const availableAccountsAtom = Atom.map(dashboardsAtom, (dashboards): CachedAccount[] => [
  toCachedAccount(demoDashboard),
  ...cachedImportedAccounts(dashboards),
]);

/**
 * Imperative read/write surface over the persisted dashboards. Built per request
 * from the router-context registry and threaded to imperative writers (the
 * dashboard view, the sign-in card), so the raw {@link AtomRegistry} stays a
 * private implementation detail rather than a prop-drilled state container.
 */
export interface DashboardStore {
  /** Read one account's cached dashboard, or `null` when absent/SSR. */
  load(accountId: string): DashboardData | null;
  /** Persist an account's dashboard; notifies hook subscribers. */
  save(data: DashboardData): void;
  /** Mark an account as the one the dashboard should render. */
  setActive(accountId: string): void;
  /** Drop the active-account pointer so the dashboard falls back to demo data. */
  clearActive(): void;
  /**
   * Delete an account's cached dashboard, and clear the active-account pointer
   * when it referenced the removed account (so the dashboard falls back to demo
   * data rather than a now-missing entry). Other accounts are left intact.
   */
  remove(accountId: string): void;
}

/**
 * Build a {@link DashboardStore} that closes over the per-request
 * {@link AtomRegistry}. The registry is the same instance the React hooks read
 * (seeded into `EffectAtomProvider` from the router context), so a write reaches
 * the instance {@link useActiveDashboard} / {@link useCachedAccounts} subscribe
 * to. Every writer keeps the `typeof window` no-op guard so a server render
 * never touches `localStorage`.
 */
export function makeDashboardStore(registry: AtomRegistry.AtomRegistry): DashboardStore {
  return {
    load: (accountId) => {
      if (typeof window === "undefined") return null;
      return registry.get(dashboardsAtom)[accountId] ?? null;
    },
    save: (data) => {
      if (typeof window === "undefined") return;
      registry.set(dashboardsAtom, {
        ...registry.get(dashboardsAtom),
        [data.profile.accountId]: data,
      });
    },
    setActive: (accountId) => {
      if (typeof window === "undefined") return;
      registry.set(
        activeAccountIdAtom,
        accountId === demoDashboard.profile.accountId ? null : accountId
      );
    },
    clearActive: () => {
      if (typeof window === "undefined") return;
      registry.set(activeAccountIdAtom, null);
    },
    remove: (accountId) => {
      if (typeof window === "undefined") return;
      const { [accountId]: _removed, ...rest } = registry.get(dashboardsAtom);
      registry.set(dashboardsAtom, rest);
      if (registry.get(activeAccountIdAtom) === accountId) {
        registry.set(activeAccountIdAtom, null);
      }
    },
  };
}

/**
 * Subscribe to the active account's cached dashboard, falling back to the demo
 * dataset when none is active. Returns {@link demoDashboard} on the server and
 * the initial client render, then swaps to the cached data once the runtime
 * resolves the first `localStorage` read.
 */
export function useActiveDashboard(): DashboardData {
  return useAtomValue(activeDashboardAtom);
}

/** Subscribe to the accounts with a cached dashboard entry; empty on the server. */
export function useCachedAccounts(): CachedAccount[] {
  return useAtomValue(cachedAccountsAtom);
}

/** Subscribe to every profile available from the dashboard switcher, including demo data. */
export function useAvailableAccounts(): CachedAccount[] {
  return useAtomValue(availableAccountsAtom);
}
