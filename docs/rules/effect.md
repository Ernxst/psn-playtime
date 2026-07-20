# Effect (the library)

Project-specific conventions for [Effect](https://effect.website) v4. For React
`useEffect`, see [React effects](./effects.md). The global Effect skill governs
general API selection and verification; this file records only local version and
architecture decisions.

The project pins `effect@4.0.0-beta.91` and `@effect/atom-react@4.0.0-beta.91`.
Atom core comes from `effect/unstable/reactivity/*`. Verify every API against the
installed source because v3 examples and later v4 APIs may not apply.

Local conventions:

- Import namespaces from Effect subpaths and React bindings from `@effect/atom-react`.
- Define make-less capability contracts with `Context.Service`; implementations live in layers.
- Service keys follow `psn-playtime/<path-from-src>/<ServiceName>` and are enforced by the Effect language service.
- Read services with `yield* Service`; name primary layers `layer` and variants `layerTest` or `layerConfig`.
- Model expected failures with stable `Data.TaggedError` tags and recover through the typed error channel.

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

`pnpm typecheck` includes `tsconfig.effect.json`, whose Effect language-service
diagnostics apply to production `*.effect.ts(x)` files. Effectful tests retain
the `.effect.` marker but end in `.test.ts(x)` and intentionally use normal test
ergonomics.

### What the rules forbid (in `*.effect.ts(x)`)

Globals that hide effects are banned in favour of Effect-native equivalents:
`Date` → `DateTime`/`Clock`, `Math.random`/`crypto.randomUUID` → `Random`,
`fetch` → `HttpClient`, `console` → `Effect.log*`, `process.env` → `Config`,
timers/`new Promise`/`async function` → Effect combinators, and `node:*`
imports → `@effect/platform`. Style rules also require pipeable/do-notation form
and the path-derived service keys above. Ground replacements in the local Effect
source before reaching for a global.

## Capability contracts

The provider-grouped contracts decouple the app from any one upstream. Each is a
make-less `Context.Service<Self, Shape>()("key")` declaration; its implementation
`Layer` lives beside it and is wired into the server runtime.

- **`DashboardSource`** (`src/server/providers/account/contract.effect.ts`) —
  `loadDashboard(credential)` produces the normalized `DashboardData`. The
  credential is a `Redacted<string>`; no source-specific naming crosses the
  boundary. Implemented by `PsnDashboardSourceLayer`, provided per request at the
  handler boundary since it carries a transient credential.
- **`TitleEnrichment`** (`src/server/providers/enrichment/contract.effect.ts`) —
  `metadataFor` / `franchiseFor` enrich a title by name. Missing data is a
  successful absence, never an error. Implemented by `TitleEnrichmentLayer`,
  folded into `serverRuntime` so its caches outlive a request; effects reach it
  through `runServer`.
- **Tagged errors** (`src/server/providers/errors.effect.ts`) —
  `CredentialRejectedError`, `UpstreamUnavailableError`, `RateLimitedError`.
  There is no `NotFound` (no match = success). Safe to expose: the closed
  `ProviderSource` union (`"psn" | "rawg"`) as structured context and fixed
  `reason` codes — never raw vendor text, a `cause`, URLs, or tokens.
