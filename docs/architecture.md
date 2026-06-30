# Source map

What each top-level directory under `src/` is for. The shape follows two ideas: **feature-first** UI (code grouped by product feature, not by technical kind) and **ports & adapters** on the server (an agnostic contract per concept, with provider-specific implementations nested beneath it).

## Routing & entry (do not move)

`routes/`, `routeTree.gen.ts`, `router.tsx`, `server.ts`, `styles.css` — the TanStack Start entry points and file-based routing. `routeTree.gen.ts` is generated (`pnpm generate-routes`); never edit it by hand. These paths are load-bearing for route generation and must stay put.

## `runtime/`

The Effect runtime and client-state wiring: the server runtime (`runtime.effect.ts`), the browser `localStorage` atom runtime (`kvs.effect.ts`), and the `@effect/atom` registry setup (`provider.effect.tsx`). This is the seam where Effect programs are actually executed.

## `integrations/`

Setup for genuine third-party libraries that need app-level wiring (e.g. TanStack Query). Reserved for real external integrations — not a dumping ground for our own modules.

## `server/`

Server-only code. Never imported by the client except through the typed server-fn boundary.

- `api/` — the `createServerFn` handlers, split by concept (`account.effect.ts`, `enrichment.effect.ts`). The only surface the client calls.
- `providers/` — ports & adapters, grouped **by concept**. Each concept owns an agnostic contract plus its return type at the root, with provider implementations nested beneath:
  - `account/` — `contract.effect.ts` (the `DashboardSource` port), `snapshot.ts` (the `DashboardData` contract it returns), and `psn/` (the PlayStation implementation: session, provider, normalisation, pagination). A future Xbox provider would be `account/xbox/`.
  - `enrichment/` — `contract.effect.ts` (the `TitleEnrichment` port) and `rawg/` (the RAWG implementation). RAWG is the sole enrichment source.
  - `errors.effect.ts` — the shared provider-error vocabulary.
- `security/` — server security concerns (e.g. `csp.ts`).

## `domain/`

Shared, **pure** logic used across features — no React, no Effect workflows, no network. Date-free and global-free so it stays out of the strict Effect glob and can be imported cheaply by both client and server (e.g. `transactions.ts`, `transaction-bookmarklet.ts`, `round.ts`, `mock.ts`).

## `features/`

Feature-first UI. Each feature owns its components **and** its feature-specific pure logic:

- `dashboard/` — components plus dashboard-only modules (`analytics.ts`, `spend.ts`, `trophies.ts`, `query.ts`, `format.ts`, `llm-prompt.ts`, `util.ts`).
- `onboarding/` — the sign-in flow.
- `import/` — the transaction-import receiver.

Pure logic shared across _more than one_ feature lives in `domain/`, not here.

## `stores/`

Shared client-state stores backed by SSR-safe `localStorage` (via `useSyncExternalStore`): `dashboard-store.ts` and `transactions-store.ts`. Shared because each store spans multiple features.

## `components/ui/`

Vendored shadcn/ui primitives. Treated as third-party: not restructured. Do not hand-edit these as if they were our components.

## `hooks/`

Shared React hooks not tied to a single feature (e.g. `use-media-query.ts`).

## `lib/`

Generic, non-domain utilities with no product knowledge (e.g. `utils.ts`, `seo.ts`). If a helper encodes domain meaning it belongs in `domain/` or a feature, not here.

## `test/`

Shared test helpers and fixtures (e.g. the in-memory Web Storage stub). Excluded from coverage.

## Conventions

- **File naming:** the only infixes are `.effect.` (modules inside the strict Effect glob) and `.test.` / `.browser.test.`. Everything else is plain kebab-case `.ts`.
- **Tests are co-located** with the module they cover.
- **Import alias:** `@/` maps to `src/`.
