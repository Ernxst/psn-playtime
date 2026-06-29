import { RegistryContext } from "@effect/atom-react";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import type { ReactNode } from "react";

/**
 * Supplies the atom `AtomRegistry` to a React subtree, mounted at the app root.
 *
 * The registry is created once per request in the router context factory
 * (`getContext`) and threaded in via the `registry` prop, so the React hooks
 * that read through `RegistryContext` and the imperative writers that receive
 * the same instance from a loader's `context` share one registry. On the server
 * that instance is per-request (router instances are not shared across
 * requests); in the browser it is the single app registry. No module singleton,
 * and no project-level `useEffect`, per docs/rules/effects.md.
 */
export function EffectAtomProvider({
  registry,
  children,
}: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}
