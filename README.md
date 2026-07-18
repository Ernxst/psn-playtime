# PSN Playtime

Your PlayStation history, visualised. A single-user dashboard that turns your
PSN play-time and trophies into plain-English charts — built for showing friends
"where did all my hours go?".

Renders a bundled **demo dataset** out of the box, or sign in with your own PSN
token to see your real library.

## How it works

The PSN API can't be called from a browser (token + CORS), so a **TanStack Start
server function** does the fetch. You paste a one-time `npsso` token; the server
exchanges it via [`psn-api`](https://github.com/achievements-app/psn-api),
normalises everything into a single `DashboardData` shape, and the React UI
renders it. The token is held only in an httpOnly session cookie — it never
reaches the browser and is never committed.

```
npsso ──▶ server fn (psn-api) ──▶ DashboardData ──▶ TanStack Query ──▶ charts
          httpOnly cookie
```

## Getting your npsso token

1. Log in at <https://playstation.com> in your browser.
2. In the **same** browser, open <https://ca.account.sony.com/api/v1/ssocookie>.
3. Copy the 64-character `npsso` value from the JSON.
4. Paste it into the app's sign-in screen.

The token expires after ~2 months; grab a fresh one when sign-in stops working.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build (Nitro)
pnpm typecheck    # tsgo --noEmit
pnpm lint         # oxlint
pnpm format       # oxfmt --write
pnpm test         # vitest (node + browser projects)
```

## Deploy (Cloudflare Workers)

The default `pnpm build` produces a Nitro **node-server** bundle (`node .output/server/index.mjs`).
Cloudflare is a separate, opt-in build:

```bash
pnpm build:cf     # NITRO_PRESET=cloudflare_module vite build
```

This emits a Workers entry at `.output/server/index.mjs`, static assets at
`.output/public`, and — by reading the root [`wrangler.jsonc`](./wrangler.jsonc) —
a deploy-ready `.output/server/wrangler.json` (plus a `.wrangler/deploy/config.json`
redirect that points `wrangler` at it).

Deployment is wired through the **Cloudflare Workers Builds** GitHub integration —
no GitHub Action. In the Cloudflare dashboard the owner connects the repo and sets:

| Setting           | Value                                |
| ----------------- | ------------------------------------ |
| Build command     | `pnpm build:cf`                      |
| Deploy command    | `npx wrangler deploy` (default)      |
| Production branch | `main`                               |
| Custom domain     | `psn.ernestbadu.dev`                 |
| Secret            | `RAWG_API_KEY` (optional, see below) |

`wrangler.jsonc` sets `name: psn-playtime`, `compatibility_date: 2026-06-03`, and
`compatibility_flags: ["nodejs_compat"]` (psn-api reaches for `node:crypto`/`node:buffer`),
with the static assets bound as `ASSETS`. `RAWG_API_KEY` is set as a Cloudflare
**secret** (Settings → Variables), not committed. Validate the bundle locally without
deploying via `pnpm build:cf && npx wrangler deploy --dry-run`.

## Genre classification

Titles with missing genre or franchise data are enriched through the
[RAWG](https://rawg.io/apidocs) games database after the dashboard loads.
Successful lookups are cached for the worker process, then persisted with the
enriched dashboard in the browser.

This is **opt-in**: set `RAWG_API_KEY` to enable it. With no key, RAWG enrichment
is skipped. Copy `.env.example` to `.env` and add your free key:

```bash
cp .env.example .env   # then set RAWG_API_KEY
```

| Env var        | Required | Purpose                                                 |
| -------------- | -------- | ------------------------------------------------------- |
| `RAWG_API_KEY` | No       | Enables RAWG genre lookups for otherwise-`Other` titles |

## Stack

- **TanStack Start** (SSR) + **TanStack Query**
- **Tailwind v4** + **shadcn/ui** + bazza `hit-area`, charts via **Recharts**
- **psn-api** for PSN data, **Effect Schema** for input validation
- **oxlint** + **oxfmt** + **tsgo**, **lefthook** git hooks, **knip**
- Vitest **browser mode** (Playwright/Chromium) for component tests

> Demo numbers are derived from a real PSN export and are illustrative.

See [`docs/architecture.md`](./docs/architecture.md) for the source map.
