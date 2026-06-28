# Effect (the library)

Conventions for [Effect](https://effect.website) v4 and `@effect/atom`. This is
**not** the React `useEffect` rule — for that, see [Effects](./effects.md).

We run Effect **v4 beta** (`effect@4.0.0-beta.91`) with the atom React bindings
(`@effect/atom-react@4.0.0-beta.91`). The atom **core** lives inside `effect`
itself at `effect/unstable/reactivity/*` — there is no separate atom-core
package to install. v4 beta APIs differ from v3 and from most training data;
ground every API against the local source before using it.

## Imports

- Namespace imports from subpaths: `import * as Effect from "effect/Effect"`,
  `import * as Layer from "effect/Layer"`, `import * as Atom from
"effect/unstable/reactivity/Atom"`.
- React bindings come from `@effect/atom-react` (`RegistryProvider`,
  `useAtomValue`, `useAtom`, …).

## Services

- Define services with `Context.Service` (v4 replaces v3's `Context.Tag` /
  `Effect.Service`):

  ```ts
  export class AppConfig extends Context.Service<AppConfig>()("psn-playtime/AppConfig", {
    make: Effect.succeed({ appName: "psn-playtime" }),
  }) {
    static readonly layer = Layer.effect(this, this.make);
  }
  ```

- Identifier strings are namespaced: `psn-playtime/<ServiceName>`.
- Prefer `yield* Service` inside `Effect.gen` over `Service.use(...)` so
  dependencies stay explicit at the call site.

## Layers

- Build a service's layer from its `make` effect with `Layer.effect(this,
this.make)`; v4 does **not** auto-generate a `Default` layer.
- Name the primary layer `layer`; use descriptive suffixes for variants
  (`layerTest`, `layerConfig`). Do not use v3's `Default` / `Live`.
- Wire dependencies with `Layer.provide`; there is no `dependencies` option.
- Compose the composition root with `Layer.mergeAll`.

## Tagged errors

- Model failures as data with `Data.TaggedError("Name")<{ … }>`; never `throw`.
- Keep the `_tag` short (`AppConfigError`), since it is the literal matched by
  `Effect.catchTag`.
- Recover on the typed channel with `Effect.catchTag` / `Effect.catchTags`.

## Error-channel policy

- Expected failures belong on the **error channel** (`E`), recovered explicitly.
- Defects (`Effect.die`, thrown exceptions) are for truly unrecoverable bugs.
- An Effect's `R` (requirements) must be fully provided by a layer before it is
  run; never widen `R` to `never` by casting.

## Runtimes

- The composition root lives in `src/integrations/effect/`.
- `appRuntime` is the long-lived client runtime; `serverRuntime` is for
  `createServerFn` handlers. Keep them distinct so server-only layers never
  reach the client bundle.
- Run effects only at the edges: `runtime.runPromise` / `runtime.runSync` /
  `runtime.runFork`. Inside a server handler use `runServer(effect)`.
- Build a `ManagedRuntime` once at module scope; dispose only runtimes you own
  locally (e.g. in tests, via `onTestFinished(() => runtime.dispose())`).

## Atoms (React)

- Provide the registry with `RegistryProvider` from `@effect/atom-react`. It
  manages its own registry lifecycle, so no project-level `useEffect` is needed
  to wire it (see [Effects](./effects.md)).
- Derive runtime-backed atoms from `Atom.runtime(layer).atom(effect)`; read
  them with `useAtomValue` (pass a **stable, module-scoped** selector, never an
  inline closure, to avoid re-subscribing every render).
- Atom values from runtime atoms are `AsyncResult<A, E>`; read them with
  `AsyncResult` accessors (`getOrElse`, `getOrThrow`, `match`).

## Definition of Done

- Every API used is grounded in the local Effect source, not recalled.
- Services are `Context.Service`; layers are named `layer`; errors are
  `Data.TaggedError` and recovered via `catchTag`.
- Effects run only through a `ManagedRuntime`/atom runtime at the edges.
- New code adds no project-level `useEffect`.
