import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { makeTransactionStore, startCrossTabSync } from "@/stores/transactions-store";

export function getContext() {
  const queryClient = new QueryClient();
  // One registry per request (per router instance): isolated on the server,
  // the single app registry in the browser. The provider seeds it into
  // `RegistryContext` so React hooks read it; the transaction store closes over
  // the same instance so imperative loader writes notify those hooks. Both share
  // one registry per request — verified by the store reactivity tests.
  const atomRegistry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
  const transactionStore = makeTransactionStore(atomRegistry);

  // Client boot only (this factory runs once per router): register the
  // app-lifetime `storage` listener over the single browser registry so a
  // transactions write in another tab refreshes `useTransactionImport` here.
  // `startCrossTabSync` no-ops on the server (no `window`), keeping SSR untouched.
  startCrossTabSync(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
  };
}
