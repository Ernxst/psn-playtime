# PR #337 exact-head baseline

**Audited head:** `699cb7ae473388480f3deea14821a074c67dec14` (`origin/codex/issue-327-playloom-prototype` matched locally).

**Comparison:** `2bb3082c52411652956c60557447df06d7e7e456..699cb7ae473388480f3deea14821a074c67dec14`.
**Evidence boundary:** tracked repository history, current source, PR metadata, and a fresh narrow browser rerun. Quarantined recordings are excluded.

## Current-head delta and evidence boundary

The comparison has five tracked changes:

- `docs/pr-337-remediation-plan.md` — new 373-line remediation contract.
- `src/features/dashboard/components/dashboard-view.tsx` — profile/source menu and marquee styling moved into owned JSX.
- `src/features/dashboard/components/refresh-dashboard.tsx` — refresh-sheet styling moved into owned JSX; progress focus treatment and controls are locally styled.
- `src/features/dashboard/components/refresh-dashboard.browser.test.tsx` — adds the 44px refresh-sheet-control geometry assertion.
- `src/styles.css` — 199 lines of profile/refresh/marquee component overrides removed; semantic Playloom tokens added.

`docs/issue-327-verification.md`, `docs/issue-327-capability-audit.md`, and all eight tracked WebM files are byte-for-byte unchanged across the range. Therefore none of them is a recording, rendered inspection, or audit of `699cb7a`.

## Retain as baseline/reference, not approval evidence

### Retained behavior baseline

The behavior to preserve is the repaired `2bb3082` capability set, subject to unresolved review defects—not a claim that every capability was accepted:

- The recorded retention inventory covers routes/onboarding, profile/history/spending/library/tools, filters/sorts, import/export, account actions, Ask AI, responsive states, and safe signed-in demo (`docs/issue-327-capability-audit.md:5-96`).
- The remediation contract explicitly preserves routes, metrics, charts, insights, controls, filters, sorts, states, workflows, responsive capability, repaired hash/account/refresh/filter/transaction behavior, exact metrics, and PSN artwork composition (`docs/pr-337-remediation-plan.md:72-88`).
- The current implementation still contains the profile account switcher and safe refresh flow (`src/features/dashboard/components/dashboard-view.tsx:230-290,350-368`; `src/features/dashboard/components/refresh-dashboard.tsx:102-135,169-223`).
- The only new automated evidence in this range is the safe-demo refresh-sheet target-height check (`src/features/dashboard/components/refresh-dashboard.browser.test.tsx`, new test). It supports only those four controls being at least 44px in its browser harness; it does not revalidate the complete capability inventory.

Reviews at `2bb3082` qualify the baseline: direct spending discoverability, hash landing, overlay/scroll preservation, partial/no-purchase states, mobile overflow, and onboarding hydration were reported defective. Do not carry the audit's universal retention wording forward as an acceptance result until these are exercised on the candidate head.

### Visual reference to preserve

The review-approved direction to carry into Phase 2 is the Fraunces/Manrope pairing, warm paper/ink palette, cobalt accent, book-spine navigation, 3:4 poster language, tabular data, nearby caveats, and calm dashboard. This is stated in the rendered design review and codified as an invariant (`docs/pr-337-remediation-plan.md:80-84`). The `2bb3082` recordings and review screenshots remain useful historical visual references for that direction and for before/after comparison only.

### Rejected mechanism

Do **not** treat the old global component-override implementation as a baseline. The rendered design review identifies `src/styles.css` as a parallel component-specific styling system and requires its removal. The plan repeats that the repair is a controlled presentation rebuild, not another correction pass over the global override layer (`docs/pr-337-remediation-plan.md:7-8,85,160-166,219-232`). The current delta begins localisation for profile/refresh but does not establish the Phase 2 representative slice or eliminate the remaining global override layer.

## Stale or unsupported at `699cb7a`

### PR body

The PR body is stale as current-head evidence because it links branch-relative evidence created for the earlier prototype rather than evidence recorded at `699cb7a`.

- Its test plan says `pnpm test` ran **61 files / 1,432 tests**, followed by broad real-UI, overflow, reduced-motion, no-network, ffprobe, and recording-review assertions. These are historical `2bb3082` claims, not executions observed in this audit at `699cb7a`. The later kickoff comment reports 1,436 tests, making the 1,432 count specifically obsolete.
- The checkboxes claiming all dashboard capabilities retained, desktop/mobile flows verified, all listed states verified, and project gates passed on the exact pushed head lack an exact SHA and still point to the unchanged verification document and WebMs.
- Its four branch-relative “After” recordings cannot demonstrate the profile-menu, marquee, and refresh-sheet changes made after `2bb3082`.

The body correctly leaves product approval unchecked; it must not be read as rendered approval of `699cb7a`.

### `docs/issue-327-verification.md`

This document is historical and stale for exact-head verification:

- The opening scope/result and observable matrix (`:3-17`) claim live-app results, including zero overflow, state behavior, safe-demo network behavior, reduced motion, keyboard behavior, and 44px controls, without identifying `699cb7a`; they predate the current localisation delta.
- The matched-media table and ffprobe/frame-inspection claim (`:19-34`) describe the unchanged eight recordings. The four “after” videos are not captures of the current profile/refresh/marquee styling.
- Its exhaustive capability result (`:36-40`) says every capability is reachable and no production data path changed. It is not a current rendered or lifecycle audit, and it cannot resolve the PR reviews' known defects.
- Its automated-gate totals (`:71-78`) are stale as exact-head claims (notably 1,432 tests) unless rerun and recorded against the frozen candidate SHA.
- Its approval statement (`:80-81`) remains directionally correct: approval is still required. It is not evidence that the required Phase 2 slice exists.

### `docs/issue-327-capability-audit.md`

This is a useful historical capability map, not a current acceptance matrix:

- It explicitly maps the `72bbd59` main baseline to the prototype (`:3`) and has not been reconciled with the later current-head preparation.
- Its final universal statement—“All existing routes, metrics, charts, insights, controls, states and workflows remain present. No capability is removed, collapsed, hidden behind chapter tabs, or assigned a different data meaning” (`:92-96`) is stale/overbroad. Reviews at `2bb3082` found Spending destinations consolidated/demoted and identified lifecycle, partial-state, and responsive failures. Presence in this table is not proof of current direct usability or discoverability.
- Its state rows (`:82-90`) name static hooks and intended behavior but contain no exact-head action, accessibility, desktop/mobile, lifecycle, or media result. Phase 1 must turn them into observable rows.

### Tracked media

All eight files under `docs/evidence/issue-327/` are tracked and unchanged in the comparison.

- **Before media:** valid only as historical baseline footage for matched comparison; it cannot prove current behavior.
- **After onboarding media:** potentially useful visual history because onboarding source is not among this range's source changes, but still not current-head evidence. Final evidence must be generated only after the candidate head is frozen.
- **After dashboard desktop/mobile media:** stale for current-head visual acceptance because the dashboard marquee/profile menu and refresh sheet changed after the recordings. They also do not establish the unresolved review scenarios.

No untracked/quarantined recording was considered.

### PR reviews/comments

All substantive rendered, UX, runtime, and motion reviews were submitted against `2bb3082`, not `699cb7a`; they are binding historical findings and reference material, not approval of the current head.

- Rendered-design review: preserve the editorial direction; correct stock interaction surfaces, Spending discoverability, density, and shell-contained system states.
- UX review: preserve capabilities while correcting credential handling, navigation/hash, filters, sorting, status/focus/landmarks, refresh progression, and responsive semantics.
- Runtime and hydration reviews: re-exercise overlay anchoring/scroll restoration, partial and no-purchase states, mobile width, and returning-account hydration.
- Motion review: retain the restraint principles, but do not claim motion acceptance before positioning/lifecycle work is stable.
- The kickoff comment at `699cb7a` is the only exact-head PR comment. Its reported static/browser gates are useful reported provenance, but it explicitly says this is a **clean kickoff baseline, not rendered approval of the representative slice**.

There are no inline PR review comments. The PR body and all four issue comments were reviewed.

## Evidence valid only as historical reference

- Eight tracked WebMs and their recorded geometry/duration/ffprobe results.
- The verification document's prior browser observations, frame inspection, gate outcomes, and test totals.
- The capability-audit route/capability mapping.
- The three formal reviews and the first three issue comments at `2bb3082`.
- The design-review screenshots linked from the PR comment (historical review artifacts, not current captures).

These establish what to compare against and what must be preserved or repaired. They do not establish visual, runtime, accessibility, responsive, motion, or final-gate acceptance for `699cb7a` or any future Phase 2 head.

## Phase 2 replacement evidence required

Freeze the representative-slice SHA before collecting evidence. On that same SHA, replace/produce:

1. **Exact-head record:** SHA, branch/remote equality, clean tracked worktree, commands with unabridged results, and updated test totals.
2. **Representative-slice rendered set:** 1440×900, intermediate width, and 390×844 captures for loaded opening/Overview, open-and-closed overlay at nonzero scroll, loading, empty, error, partial, and no-results states inside the Playloom shell.
3. **Interaction/lifecycle proof:** keyboard focus order/restoration; account/profile switching; desktop and mobile filter surfaces; cold and warm hash navigation; scroll preservation; status/error announcements; and safe-demo refresh validation/rejection/progress/success/no-network behavior. Record the action, observed state, viewport, and exact SHA.
4. **Capability matrix:** replace the prose-only audit with per-capability actions, expected state/data scope, desktop/mobile and keyboard/AT behavior, automated assertion, and rendered evidence. Include directly discoverable Purchase history, Most spent, Add-ons, and Purchase import even if those chapters are outside the representative slice.
5. **Media:** new matched before/after recordings from equivalent seeded data/actions. Inspect container/stream/size/duration plus start/middle/end frames; verify the delivered PR rendering is playable. Do not reuse the old after-dashboard clips as current evidence.
6. **Architecture evidence:** remaining global CSS footprint and the deleted/migrated owned rules, showing that the candidate slice does not recreate the rejected override mechanism.
7. **Review-ready limitations:** distinguish unimplemented chapters and untested excluded areas from passing evidence. Do not claim product approval until the user approves the rendered representative slice.

## Narrow rerun

`pnpm test:browser` passed at `699cb7ae473388480f3deea14821a074c67dec14`: 28 browser files and 222 tests. This confirms the existing browser-test baseline only; it is not rendered approval or proof that the Phase 2 slice exists.

## Residual risk

No current-head rendered or media evidence exists yet. Phase 2 must replace the historical evidence on a frozen slice SHA and retain later chapters without redesigning them.
