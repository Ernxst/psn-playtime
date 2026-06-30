import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { makeDashboardStore } from "@/stores/dashboard-store";
import { makeTransactionStore, startCrossTabSync } from "@/stores/transactions-store";

export function getContext() {
  const queryClient = new QueryClient();
  // One registry per request (per router instance): isolated on the server,
  // the single app registry in the browser. The provider seeds it into
  // `RegistryContext` so React hooks read it; the transaction and dashboard
  // stores close over the same instance so imperative writes notify those hooks.
  // Both share one registry per request — verified by the store reactivity tests.
  const atomRegistry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
  const transactionStore = makeTransactionStore(atomRegistry);
  const dashboardStore = makeDashboardStore(atomRegistry);

  // Register the `storage` listener over this request's registry so a
  // transactions write in another tab refreshes `useTransactionImport` here.
  // Idempotent per registry, so a repeated router construction or HMR pass over
  // the browser registry re-uses the one listener rather than stacking another;
  // `startCrossTabSync` no-ops on the server (no `window`), keeping SSR
  // untouched. The returned teardown is unused here — the browser registry lives
  // for the app's lifetime, and the per-registry guard prevents duplicates.
  startCrossTabSync(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
    dashboardStore,
  };
}
