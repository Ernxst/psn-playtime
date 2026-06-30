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
- React bindings come from `@effect/atom-react` (`RegistryContext`,
  `useAtomValue`, `useAtom`, …).

## Services

- Define services with `Context.Service` (v4 replaces v3's `Context.Tag` /
  `Effect.Service`). The platform-agnostic ports are make-less — an
  implementation layer supplies the behaviour (see
  [Service ports](#service-ports-the-platform-agnostic-seam)):

  ```ts
  export class TitleEnrichment extends Context.Service<TitleEnrichment, TitleEnrichmentShape>()(
    "psn-playtime/server/providers/enrichment/contract.effect/TitleEnrichment"
  ) {}
  ```

- Identifier strings are the **deterministic key** the `deterministicKeys` rule
  derives from the file path: `psn-playtime/<path-from-src>/<ServiceName>` (no
  extension). The strict typecheck (below) fails on any other key.
- Prefer `yield* Service` inside `Effect.gen` over `Service.use(...)` so
  dependencies stay explicit at the call site.

## Layers

- Build a service's layer from a `make` effect with `Layer.effect(Service,
make)`, or `Layer.succeed(Service, value)` for a constant; v4 does **not**
  auto-generate a `Default` layer.
- Name the primary layer `layer`; use descriptive suffixes for variants
  (`layerTest`, `layerConfig`). Do not use v3's `Default` / `Live`.
- Wire dependencies with `Layer.provide`; there is no `dependencies` option.
- Compose the composition root with `Layer.mergeAll`.

## Tagged errors

- Model failures as data with `Data.TaggedError("Name")<{ … }>`; never `throw`.
- Keep the `_tag` stable and descriptive (e.g. `RateLimitedError`),
  since it is the literal matched by `Effect.catchTag`.
- Recover on the typed channel with `Effect.catchTag` / `Effect.catchTags`.

## Error-channel policy

- Expected failures belong on the **error channel** (`E`), recovered explicitly.
- Defects (`Effect.die`, thrown exceptions) are for truly unrecoverable bugs.
- An Effect's `R` (requirements) must be fully provided by a layer before it is
  run; never widen `R` to `never` by casting.

## Runtimes

- The server composition root lives in `src/runtime/runtime.effect.ts`:
  `serverRuntime` is a module-scoped `ManagedRuntime` built from
  `TitleEnrichmentLayer`, reached through `runServer(effect)` inside
  `createServerFn` handlers. Its effects require `TitleEnrichment` /
  `DashboardSource`; the per-request `DashboardSource` is provided at the handler
  boundary. Keep server-only layers here so they never reach the client bundle.
- Browser-`localStorage`-backed atoms run on `kvsRuntime`
  (`src/runtime/kvs.effect.ts`), an `Atom.runtime` built from
  `KeyValueStore.layerStorage` alone.
- Run effects only at the edges: `runtime.runPromise` / `runtime.runSync` /
  `runtime.runFork`. Inside a server handler use `runServer(effect)`.
- Build a `ManagedRuntime` once at module scope; dispose only runtimes you own
  locally (e.g. in tests, via `onTestFinished(() => runtime.dispose())`).

## Atoms (React)

- Provide the registry with `EffectAtomProvider`
  (`src/runtime/provider.effect.tsx`), which seeds `RegistryContext` from
  `@effect/atom-react` with a per-request `AtomRegistry` created in the router's
  `getContext`. No module singleton and no project-level `useEffect` to wire it
  (see [Effects](./effects.md)).
- Derive runtime-backed atoms from `Atom.runtime(layer).atom(effect)`; read
  them with `useAtomValue` (pass a **stable, module-scoped** selector, never an
  inline closure, to avoid re-subscribing every render).
- Atom values from runtime atoms are `AsyncResult<A, E>`; read them with
  `AsyncResult` accessors (`getOrElse`, `getOrThrow`, `match`).

## The `*.effect.ts(x)` convention & strict rules

Effectful code lives in files named `*.effect.ts` / `*.effect.tsx`. The name is
load-bearing: it is the glob that opts a file into the strict
[`@effect/language-service`](https://github.com/Effect-TS/language-service)
rule set. Anything outside that convention is checked only by the base
`tsconfig.json`.

- **Production effect code** → `name.effect.ts(x)` (e.g.
  `contract.effect.ts`, `provider.effect.tsx`).
- **Effectful tests** → `name.effect.test.ts(x)` (e.g.
  `account.effect.test.ts`). They carry the `.effect.` marker for discovery but
  end in `.test.ts(x)`, so they stay matched by vitest **and** fall outside the
  strict `**/*.effect.ts(x)` include — test ergonomics (gen, inline closures)
  are not held to the production rules.

### How enforcement works

- `tsconfig.effect.json` extends `tsconfig.json`, adds the
  `@effect/language-service` plugin with every diagnostic set to `error`
  (`diagnosticSeverity`), and includes only `**/*.effect.ts(x)`.
- `@typescript/native-preview`'s `tsgo` does not load TS language-service
  plugins on its own. `@effect/tsgo` ships a `tsgo` fork that does; its
  `effect-tsgo patch` command (run by the `prepare` script on install) swaps the
  native-preview binary for the fork. After patching, the plugin's diagnostics
  surface during typecheck — not just in the editor.
- `pnpm run typecheck:effect` runs `tsgo --noEmit -p tsconfig.effect.json`.
  `pnpm run typecheck` chains it after the base check, so CI, the gate, and the
  lefthook pre-commit hook all fail on a rule violation.

### What the rules forbid (in `*.effect.ts(x)`)

Globals that hide effects are banned in favour of Effect-native equivalents:
`Date` → `DateTime`/`Clock`, `Math.random`/`crypto.randomUUID` → `Random`,
`fetch` → `HttpClient`, `console` → `Effect.log*`, `process.env` → `Config`,
timers/`new Promise`/`async function` → Effect combinators, and `node:*`
imports → `@effect/platform`. Style rules also require pipeable/do-notation form
and the path-derived service keys above. Ground replacements in the local Effect
source before reaching for a global.

## Service ports (the platform-agnostic seam)

`src/server/ports/*.effect.ts` holds the interface-only seam (phase E3) that
decouples the app from any one account source (PSN today; the Xbox seam later).
Ports are **contracts, not implementations** — the PSN (`E5`) and RAWG (`E4`)
layers are wired in later phases.

- **`DashboardSource`** — `loadDashboard(credential)` produces the normalized
  `DashboardData` (the whole of `psn.ts`'s `authenticate` + `buildDashboard`).
  The credential is a `Redacted<string>`; no source-specific naming crosses the
  boundary.
- **`TitleEnrichment`** — `metadataFor` / `franchiseFor` (today's `rawg.ts`
  lookups). Missing data is a successful absence, never an error.
- **Tagged errors** (`errors.effect.ts`) — `CredentialRejectedError`,
  `UpstreamUnavailableError`, `RateLimitedError`: only the failure modes
  PSN/RAWG actually surface today. There is no `NotFound` (no match = success).
- Ports are make-less `Context.Service<Self, Shape>()("key")` declarations; the
  later-phase implementations provide them via `Layer`.

## Definition of Done

- Every API used is grounded in the local Effect source, not recalled.
- Services are `Context.Service`; layers are named `layer`; errors are
  `Data.TaggedError` and recovered via `catchTag`.
- Effects run only through a `ManagedRuntime`/atom runtime at the edges.
- New code adds no project-level `useEffect`.
