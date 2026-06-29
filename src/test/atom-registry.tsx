import { scheduleTask } from "@effect/atom-react";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import type { ReactNode } from "react";
import { EffectAtomProvider } from "@/runtime/provider.effect";

/**
 * The single atom registry tests share. Mirrors the per-request instance the
 * app builds in `getContext`, so imperative writers (`saveTransactionImport`)
 * and the React hooks rendered under {@link TestAtomProvider} read and write the
 * same registry — the property the reactivity tests depend on.
 */
export const testRegistry: AtomRegistry.AtomRegistry = AtomRegistry.make({
  scheduleTask,
  defaultIdleTTL: 400,
});

/** Provider bound to {@link testRegistry} for `render(ui, { wrapper: TestAtomProvider })`. */
export function TestAtomProvider({ children }: { readonly children: ReactNode }) {
  return <EffectAtomProvider registry={testRegistry}>{children}</EffectAtomProvider>;
}
