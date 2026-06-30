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

  // Mount the cross-tab sync resource on this request's registry so a
  // transactions write in another tab refreshes `useTransactionImport` here. The
  // listener is a scoped `Effect.acquireRelease` resource owned by the registry:
  // its release runs when the registry's scope finalizes (`dispose`), and the
  // registry caches one node per atom so a repeated router construction or HMR
  // pass re-uses the one listener rather than stacking another. SSR is a no-op
  // (the resource's `window` guard skips acquire). The unmount handle is unused
  // here — the browser registry lives for the app's lifetime and owns release.
  startCrossTabSync(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
    dashboardStore,
  };
}
