import { scheduleTask } from "@effect/atom-react";
import { QueryClient } from "@tanstack/react-query";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";

export function getContext() {
  const queryClient = new QueryClient();
  // One registry per request (per router instance): isolated on the server,
  // the single app registry in the browser. Threaded onto the router context so
  // React hooks and imperative loader writers share the same instance.
  const atomRegistry = AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });

  return {
    queryClient,
    atomRegistry,
  };
}
