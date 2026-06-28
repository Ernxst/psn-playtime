import { RegistryProvider } from "@effect/atom-react";
import type { ReactNode } from "react";

/**
 * Supplies the atom `AtomRegistry` to a React subtree (phase E1 foundation).
 *
 * This thin wrapper exists to prove the `@effect/atom-react` wiring; it is not
 * yet mounted at the app root — that happens in a later phase (E7). The only
 * `useEffect` involved lives inside the library's `RegistryProvider` (it manages
 * registry disposal); no project-level `useEffect` is introduced here, per
 * docs/rules/effects.md.
 */
export function EffectAtomProvider({ children }: { readonly children: ReactNode }) {
  return <RegistryProvider>{children}</RegistryProvider>;
}
