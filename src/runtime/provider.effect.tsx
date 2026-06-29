import { RegistryContext, scheduleTask } from "@effect/atom-react";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type ReactNode, useRef } from "react";

/**
 * Client-only singleton `AtomRegistry`.
 *
 * The browser renders exactly one tree, so a single registry is correct there;
 * imperative writers (e.g. `saveTransactionImport`) reach it via
 * {@link getAppRegistry} without going through React context. This is why the
 * accessor is safe: there is no per-request state to confuse on the client.
 * SSR-stateful atoms would instead need a per-request registry threaded through
 * a `HydrationBoundary` — out of scope for this POC, whose only atom
 * (`transactionImportAtom`) is client-only (`localStorage`).
 *
 * Never created on the server: each SSR request gets its own throwaway registry
 * from {@link EffectAtomProvider} below, kept isolated and never published here.
 */
let clientRegistry: AtomRegistry.AtomRegistry | undefined;

function makeRegistry(): AtomRegistry.AtomRegistry {
  return AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 });
}

/**
 * The registry imperative writers target, or `undefined` on the server (where
 * imperative writers never run). Lazily creates the client singleton so a write
 * issued before the provider first renders still lands in the very registry the
 * hooks go on to read.
 */
export function getAppRegistry(): AtomRegistry.AtomRegistry | undefined {
  if (typeof window === "undefined") return undefined;
  clientRegistry ??= makeRegistry();
  return clientRegistry;
}

/**
 * Supplies the atom `AtomRegistry` to a React subtree, mounted at the app root.
 *
 * We build the registry ourselves (rather than leaning on the library's
 * `RegistryProvider`) so imperative writers can publish to and read the same
 * instance via {@link getAppRegistry}. A `useRef` holds one registry per render
 * tree: on the server that is one per request (isolated, never published); on
 * the client we reuse the published singleton so hooks read exactly what
 * imperative writers mutate. No project-level `useEffect` is introduced, per
 * docs/rules/effects.md.
 */
export function EffectAtomProvider({ children }: { readonly children: ReactNode }) {
  const ref = useRef<AtomRegistry.AtomRegistry | null>(null);
  if (ref.current === null) {
    ref.current = makeRegistry();
    // Publish on the client during render (never on the server, where requests
    // must stay isolated). The latest-mounted tree wins, which is exactly the
    // one render tree the browser ever has.
    if (typeof window !== "undefined") clientRegistry = ref.current;
  }

  return <RegistryContext.Provider value={ref.current}>{children}</RegistryContext.Provider>;
}
