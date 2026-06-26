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

## Stack

- **TanStack Start** (SSR) + **TanStack Query**
- **Tailwind v4** + **shadcn/ui** + bazza `hit-area`, charts via **Recharts**
- **psn-api** for PSN data, **zod** for input validation
- **oxlint** + **oxfmt** + **tsgo**, **lefthook** git hooks, **knip**
- Vitest **browser mode** (Playwright/Chromium) for component tests

## Layout

| Path                        | Role                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `src/lib/psn/types.ts`      | The `DashboardData` contract (server produces, UI consumes) |
| `src/server/psn.ts`         | Server functions: token exchange + fetch + normalise        |
| `src/lib/psn/enrich.ts`     | Genre/franchise/app classification                          |
| `src/lib/psn/analytics.ts`  | Pure selectors → chart-ready series                         |
| `src/lib/psn/mock.ts`       | Bundled demo dataset                                        |
| `src/routes/`               | `/` onboarding, `/dashboard`                                |
| `src/components/dashboard/` | KPIs, charts, insights, games table                         |

> Demo numbers are derived from a real PSN export and are illustrative.
