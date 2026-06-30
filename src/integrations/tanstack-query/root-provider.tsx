import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { makeDashboardStore } from "@/stores/dashboard-store";
import { makeTransactionStore, startCrossTabSync } from "@/stores/transactions-store";

const makeAtomRegistry = () => AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });

/**
 * The browser's single app-lifetime `AtomRegistry`, created lazily on first use
 * and reused across router-context reconstructions (HMR, repeated `getRouter`).
 * Module-private and only read through {@link getAtomRegistry} — imperative
 * writes still flow through the per-context `transactionStore`/`dashboardStore`,
 * never this binding directly, and React reads through `RegistryContext`.
 */
let browserRegistry: AtomRegistry.AtomRegistry | undefined;

/**
 * Resolve the registry for a router context, mirroring `queryClient`'s
 * server-per-request vs browser-singleton split.
 *
 * Server: a fresh registry per request, so one request's atom state never bleeds
 * into another (SSR isolation); no cross-tab listener exists there.
 *
 * Browser: one app-lifetime registry, reused across context reconstructions. The
 * cross-tab `storage` listener is mounted on it exactly once — when that single
 * registry is first created — so repeated `getContext`/HMR passes reuse the one
 * listener instead of stacking a fresh registry (and a fresh listener) each
 * rebuild. The scoped `Effect.acquireRelease` resource owns release via the
 * registry's scope.
 */
function getAtomRegistry(): AtomRegistry.AtomRegistry {
  if (typeof window === "undefined") return makeAtomRegistry();
  if (browserRegistry === undefined) {
    browserRegistry = makeAtomRegistry();
    startCrossTabSync(browserRegistry);
  }
  return browserRegistry;
}

export function getContext() {
  const queryClient = new QueryClient();
  // The provider seeds this registry into `RegistryContext` so React hooks read
  // it; the transaction and dashboard stores close over the same instance so
  // imperative writes notify those hooks. Fresh per request on the server,
  // reused across reconstructions on the browser — see `getAtomRegistry`.
  const atomRegistry = getAtomRegistry();
  const transactionStore = makeTransactionStore(atomRegistry);
  const dashboardStore = makeDashboardStore(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
    dashboardStore,
  };
}
