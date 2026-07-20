# Issue #327 prototype verification

The prototype was audited against `72bbd59dcb6be90d7b3b0c72e3a7441e366b076b`. It changes presentation only: account ingestion, enrichment, persistence, transaction matching, export formats, and server APIs are unchanged.

## Observable state matrix

All checks used the live Vite app through `agent-browser`, not a component harness.

| State               | Route / viewport                          | Observed result                                                                                                                   |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Desktop demo        | `/dashboard`, 1440×900                    | Five continuous chapters, 138 poster instances, poster-led platinum shelf, retained purchase deep links, zero horizontal overflow |
| Mobile demo         | `/dashboard`, 390×844                     | Five continuous chapters, information-equivalent mobile ledger/library, zero horizontal overflow                                  |
| Loading             | `/dashboard?prototypeState=loading`       | 12 stable skeleton surfaces                                                                                                       |
| Error               | `/dashboard?prototypeState=error`         | “Couldn't load your data” and working retry control                                                                               |
| Empty               | `/dashboard?prototypeState=empty`         | “No games yet” inside the retained Playloom shell                                                                                 |
| Safe signed-in demo | `/dashboard?prototypeState=signed-in`     | Refresh simulation reports “Refreshed just now”, exposes no token input, and emits no XHR/fetch request                           |
| Reduced motion      | mobile demo with reduced-motion emulation | Media query matches; scroll behaviour is `auto`; transitions resolve to `0.01ms`                                                  |

Keyboard verification covered tab focus through native controls, Enter activation for chapter navigation and the profile control, visible focus treatment, and ≥44px app controls. The five 35×40 controls reported by the broad page probe belong to TanStack Devtools, not the prototype.

## Matched before / after recordings

Every clip is VP8 WebM recorded with `agent-browser`. The dashboard recordings follow the same sequence: filter sheet, current-year scope, chapter navigation, then the complete reading surface. Onboarding recordings cover the connection and restore flow.

| Flow               | Before                                                                              | After                                                                             | Geometry / duration      |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| Onboarding desktop | [before-onboarding-desktop.webm](evidence/issue-327/before-onboarding-desktop.webm) | [after-onboarding-desktop.webm](evidence/issue-327/after-onboarding-desktop.webm) | 1440×900 · 1.1s / 4.4s   |
| Onboarding mobile  | [before-onboarding-mobile.webm](evidence/issue-327/before-onboarding-mobile.webm)   | [after-onboarding-mobile.webm](evidence/issue-327/after-onboarding-mobile.webm)   | 390×844 · 3.7s / 9.2s    |
| Dashboard desktop  | [before-dashboard-desktop.webm](evidence/issue-327/before-dashboard-desktop.webm)   | [after-dashboard-desktop.webm](evidence/issue-327/after-dashboard-desktop.webm)   | 1440×900 · 29.2s / 28.5s |
| Dashboard mobile   | [before-dashboard-mobile.webm](evidence/issue-327/before-dashboard-mobile.webm)     | [after-dashboard-mobile.webm](evidence/issue-327/after-dashboard-mobile.webm)     | 390×844 · 49.3s / 35.4s  |

`ffprobe` confirmed all eight files have a VP8 video stream, the stated geometry, non-zero duration, and non-zero size. Midpoint frames from all eight clips and end frames from both final dashboard clips were visually inspected. The final mobile recording ends on Data controls, proving the long reading surface remains traversable.

## Capability retention

The exhaustive baseline-to-prototype mapping is in [issue-327-capability-audit.md](issue-327-capability-audit.md). The repair loop restored the original hash-free chapter navigation contract, account-wide spending scope, spend/purchase-history/spent-most/add-ons deep-link IDs, demo/count labels used by the browser contract, first-played library data, account transaction exports, trophy progress, and the PlayStation → local atlas → deterministic artwork chain.

Result: every baseline route, metric, insight, filter, import, export, account, refresh, sign-out, purchase, library, and Ask AI capability remains reachable. No production data path was added or changed.

## Artwork provenance

`public/playloom/poster-atlas.png` was generated with OpenAI image generation from this prompt:

> Create a 3 by 2 atlas of six distinct 3:4 editorial gaming posters with no logos or text: city, stadium, snowy industrial landscape, blocky wilderness, red desert, and blue coast. Use a cohesive premium screen-print and painted-paper style.

The generated source was `/Users/ernest/.codex/generated_images/019f7f35-e6b3-7e13-9869-5134b27ef9aa/exec-e5fb17a1-6b12-4ea1-8fcc-5dbb7bfeeea1.png`. The checked-in atlas supplies stable local prototype artwork only.

## Motion opportunity audit

This audit is read-only; no speculative motion was added to the prototype.

### Accepted opportunities for a later approved pass

| Location                                                                   | Purpose / frequency                | Exact proposal                                                                    | Reduced-motion treatment |
| -------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| `src/routes/index.tsx:81` trust disclosure                                 | State indication; rare             | On details content, opacity `0→1` and translateY `-4px→0`, `180ms ease-out`       | Opacity only, `80ms`     |
| `src/features/dashboard/components/dashboard-view.tsx:296` refreshed label | State indication; occasional       | Crossfade old/new status text, `160ms ease-out`                                   | Opacity only, `80ms`     |
| `src/features/dashboard/components/states.tsx:54` empty state              | Prevent a jarring state swap; rare | Icon/title opacity `0→1`, scale `.97→1`, `220ms ease-out`, maximum `40ms` stagger | Opacity only, `100ms`    |

The trust disclosure is the highest-leverage candidate because it explains a security-sensitive state change without delaying primary content.

### Rejected opportunities

| Surface                          | Reason rejected                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sidebar scroll-spy highlight     | Frequent navigation feedback already has direct state indication; movement would distract from reading  |
| Spending and library sorting     | Functional data reordering should settle immediately so rows remain scannable                           |
| Charts and distribution bars     | Animated values would hinder exact comparison and imply time-series meaning that the data does not have |
| Onboarding poster-group entrance | Proof artwork should be immediately readable; decorative entrance motion adds no explanatory value      |

## Automated gates

- `pnpm lint` — pass
- `pnpm knip` — pass
- `pnpm typecheck` — pass, including Effect typecheck
- `pnpm format:check` — pass
- `pnpm test` — pass, 61 files / 1,432 tests, including Chromium browser tests outside the sandbox
- `pnpm build` — pass; Vite retains its existing advisory for chunks over 500 kB
- React Doctor 0.8.1 changed-scope scan — 87/100; the real missing button type was repaired. The remaining eight warnings are one verified false positive on string `.includes()` and seven deliberate, tightly coupled onboarding component co-location notices.

## Approval gate

Stop here. This draft prototype requires human approval of the rendered direction and this capability-retention audit before any production implementation, final square brandmark, or merge proceeds.
