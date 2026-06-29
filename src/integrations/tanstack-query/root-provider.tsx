import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { makeTransactionStore } from "@/stores/transactions-store";

export function getContext() {
  const queryClient = new QueryClient();
  // One registry per request (per router instance): isolated on the server,
  // the single app registry in the browser. The provider seeds it into
  // `RegistryContext` so React hooks read it; the transaction store closes over
  // the same instance so imperative loader writes notify those hooks. Both share
  // one registry per request — verified by the store reactivity tests.
  const atomRegistry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
  const transactionStore = makeTransactionStore(atomRegistry);

  return {
    queryClient,
    atomRegistry,
    transactionStore,
  };
}
