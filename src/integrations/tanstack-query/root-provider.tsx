import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { makeDashboardStore } from "@/stores/dashboard-store";
import { makeTransactionStore } from "@/stores/transactions-store";

export function getContext() {
  const queryClient = new QueryClient();
  // One registry per request (per router instance): isolated on the server, and
  // freshly built on the browser too. The provider seeds it into `RegistryContext`
  // so React hooks read it; the transaction and dashboard stores close over the
  // same instance so imperative writes notify those hooks. localStorage is the
  // source of truth, so a per-request registry is correct — kvs atoms re-read it.
  const atomRegistry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
  const transactionStore = makeTransactionStore(atomRegistry);
  const dashboardStore = makeDashboardStore(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
    dashboardStore,
  };
}
