# PR #337 remediation plan

## Purpose

Bring draft PR [#337](https://github.com/Ernxst/psn-playtime/pull/337) to the prototype approval gate defined by issue [#327](https://github.com/Ernxst/psn-playtime/issues/327) without beginning production implementation.

This is a controlled presentation-layer rebuild on the existing PR, not another correction pass over the current global CSS override layer. The repaired behavior at `2bb3082c52411652956c60557447df06d7e7e456` is a capability baseline and the rendered application is a visual reference; neither is an approved implementation baseline.

## Prepared kickoff state

- Remote draft PR head: `2bb3082c52411652956c60557447df06d7e7e456`.
- Candidate localisation slice: `657571f97cbd426d183a484752135fc967b6cc0f` (`refactor(prototype): localise profile refresh styling`) followed by `db426df` (`fix(prototype): repair localised profile controls`). Together they localise profile and refresh presentation, remove 199 lines from the global override layer, restore 44px refresh-sheet targets, and replace repeated palette literals with semantic Playloom tokens. Focused and full repository gates pass, and independent code/runtime review found no pre-kickoff blocker. Preserve this as candidate work; it is not rendered product approval and must still pass the Phase 2 user gate.
- Four incomplete dashboard recordings from the stopped capture loop are quarantined in stash `82b13d73449fc5218fa4eae5bf2e755b11e4fe32` (`quarantine: stale PR 337 dashboard recordings`). Do not restore or cite them as evidence. Delete the stash only after final replacement evidence is delivered and verified.
- Confirm the PR worktree is clean and the remote branch points at the complete preparation head before kickoff.

## Sources of truth

Apply these together:

1. Issue #327 and its approved follow-up direction.
2. The original application’s complete capability set.
3. PR #337 review comments:
   - rendered redesign review;
   - visual-design review;
   - UX and interaction-design review;
   - runtime review and hydration addendum;
   - motion review.
4. Repository rules in `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/testing.md`, and `docs/rules/effects.md` where applicable.
5. The acceptance matrix created in Phase 1 of this plan.

When sources appear to conflict, preserve capability and stop for a user-owned product decision rather than consolidating, demoting, hiding, or removing behavior.

## Required skills and operating tools

Load the matching skills before their phase begins. Skills loaded after implementation cannot retrospectively constrain it.

| Skill                         | Use                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fable`                       | Own the complete workflow, preserve accumulated constraints, keep product judgment in the root context, and require evidence at the claimed layer.                         |
| `taste`                       | Preserve capability, keep component ownership local, remove the first draft’s unnecessary mechanism, and perform the final design pass after the code works.               |
| `redesign-existing-projects`  | Audit the existing implementation before editing, distinguish a new visual language from a reskin, and preserve functionality while replacing generic component treatment. |
| `design-taste-frontend`       | Establish the representative slice, prevent templated/default shadcn output, compose system states, and enforce viewport and responsive design quality.                    |
| `make-interfaces-feel-better` | Review control states, focus, typography, optical alignment, borders, shadows, and interaction polish after the structural model is approved.                              |
| `apple-design`                | Implement spatial, interruptible motion and reduced-motion behavior after layout and interaction are correct.                                                              |
| `emil-design-eng`             | Review component and motion details during the final interaction-polish pass.                                                                                              |
| `improve-animations`          | Perform a read-only motion audit if the implemented motion surface becomes broader than the current PR review. Do not use it as an implementation worker.                  |
| `effect`                      | Mandatory if any touched code imports from `effect` or `@effect/*`; verify APIs against the installed version and preserve the project’s runtime model.                    |
| `pi-subagents`                | Separate implementation, independent review, and validation. Use one writer for the active worktree.                                                                       |
| `context-mode`                | Process large diffs, test output, browser artifacts, and review data without flooding the implementation context.                                                          |
| `ask-user`                    | Obtain explicit approval of the representative slice and any unresolved product, architecture, security, or scope decision.                                                |

Use `agent-browser` for rendered-state, responsive, interaction, console, and network verification. Do not begin bulk recording until the final evidence harness passes its smoke test.

## Invariants

- Keep the work on one draft PR.
- Do not merge or begin production implementation.
- Preserve every existing route, metric, chart, insight, control, filter, sort, state, workflow, and responsive capability.
- Keep the temporary Playloom text wordmark. The final square brandmark remains deferred.
- Preserve the approved Fraunces/Manrope pairing, warm paper and ink palette, cobalt accent, book-spine navigation, 3:4 poster language, tabular data, nearby caveats, and calm dashboard.
- Preserve the repaired hash navigation, account switching, refresh validation and token retention, filter scope, transaction filtering and sorting, exact metrics, and PSN artwork composition.
- Do not introduce a second product entrypoint, parallel prototype route, or compatibility wrapper.
- Do not replace the current global override layer with another global file, CSS module, or CSS-in-JS override layer.
- Keep one implementation writer. Product judgment and final rendered acceptance remain in the root context; independent reviewers do not inherit the implementer’s reasoning.
- Do not record final evidence from a head that is still changing.

## Phase 0 — Establish the exact baseline

1. Verify the active branch, worktree, PR head, existing local changes, and ownership before editing.
2. Record the exact commit being reviewed and separate:
   - behavior worth preserving;
   - visual direction worth preserving;
   - rejected implementation mechanism;
   - stale or invalid evidence.
3. Re-run the narrow capability tests that cover the `2bb3082` repairs.
4. Confirm which PR body claims, verification documents, screenshots, and videos are stale.
5. Stop if current branch work has advanced beyond the reviewed head without a clear owner or review record.

### Exit signal

A written baseline maps every retained behavior and accepted visual element to its current source and test, and identifies all evidence that must be replaced.

## Phase 1 — Build the binding acceptance matrix

Convert the issue and every PR finding into observable requirements. Presence alone is not acceptance.

Each retained capability must specify:

- user action;
- expected state change or destination;
- preserved data scope;
- desktop behavior;
- mobile behavior;
- keyboard and assistive-technology behavior;
- cold, warm, partial, empty, loading, and failure behavior where relevant;
- automated assertion;
- rendered acceptance evidence.

The matrix must explicitly cover:

- onboarding, NPSSO connection, consent, restore, demo, and safe signed-in demo;
- profile and source switching;
- hash navigation and scroll-spy behavior;
- every game filter, spending filter, timeframe, checkbox, slider, sort, and reset action;
- Overview, Top Games, Timeline, Spending, Library, Ask AI, refresh, purchase import, and data controls;
- Purchase history, Most spent, and Add-ons as directly discoverable destinations;
- exact metrics, splits, caveats, exports, and recovery paths;
- loading, empty, error, partial-data, missing-enrichment, and no-results states;
- focus order, focus restoration, names, roles, descriptions, announcements, and hit targets;
- reduced-motion behavior and every accepted motion candidate.

### Exit signal

Every requirement has an observable action assertion and an assigned verification layer. No row relies only on “rendered,” “present,” total test count, or static gates.

## Phase 2 — Replace one representative vertical slice

Implement only the dashboard opening through Overview before propagating the system.

The slice must include:

- Playloom shell and chapter navigation;
- profile switching and account status;
- filter scope;
- meaningful profile metrics in the first 1440×900 viewport;
- desktop filters and the mobile filter surface;
- at least one overlay with open, close, focus restoration, and nonzero-scroll behavior;
- loaded, loading, empty, error, partial, and no-results representations inside the same shell;
- keyboard traversal and structural accessibility;
- responsive behavior at 390×844, an intermediate width, and 1440×900.

### Implementation model

- Put one-off styling decisions on the owning JSX with Tailwind utilities and responsive variants.
- Add a shared component or variant only after the slice demonstrates genuine repeated domain meaning.
- Keep useful shadcn/Radix behavior primitives where they serve the interaction, but author the rendered Playloom treatment through explicit local variants and composition.
- Remove migrated `.playloom-*`, descendant, structural, `[data-slot]`, and component-level `!important` rules as their owning components move.
- Use one focus treatment owned by the relevant primitive or component.
- Keep system-state composition in the product shell rather than dropping to generic cards or blank pages.

### First-slice gates

Run the narrowest relevant lint, formatting, typecheck, Effect checks, component/browser tests, and React diagnostics before repeating the structure elsewhere.

### User approval gate

Render and inspect the complete slice at desktop and mobile. Present it as a coherent draft with:

- screenshots of normal, overlay, loading, empty, and error states;
- a capability comparison against the old application;
- the remaining global CSS footprint;
- known limitations confined to unimplemented chapters.

Do not propagate the design until the user approves this slice.

## Phase 3 — Propagate the approved system

Apply the approved component vocabulary and interaction model in bounded chapter slices:

1. Top Games and artwork-led rankings.
2. Timeline and session views.
3. Spending, Purchase history, Most spent, Add-ons, filters, sorting, exports, and purchase import.
4. Library sorting, long-data navigation, responsive rows, and no-results recovery.
5. Ask AI, prompt preview, copy, open, download, and data controls.
6. Refresh states and account workflows.
7. Onboarding and restore, including the security and accessibility corrections.

For each slice:

- preserve every capability from the matrix;
- run focused static and browser gates;
- inspect desktop and mobile rendered results;
- compare against the approved representative slice;
- remove the corresponding global override rules;
- commit and push the coherent verified slice to the existing draft PR.

Do not wait until all chapters are complete to make verified work durable.

## Phase 4 — Interaction, lifecycle, security, and accessibility pass

Exercise state combinations rather than isolated fixture screens.

Required lifecycle cases include:

- cold and warm load for every hash destination;
- a returning saved account before and after hydration;
- account switching while retaining hash, filters, and relevant scroll state;
- accounts with games but no sessions, trophies, franchises, enrichment, or transactions;
- partial RAWG/PSN artwork and deterministic fallback;
- overlays opened and closed at the top, middle, and end of the page;
- refresh idle, validation failure, rejected refresh, locked progress, success, and preserved input;
- every filter and sort producing results and no results;
- mobile and desktop capability parity.

Required NPSSO and form checks include:

- password-equivalent masking and reveal behavior;
- consent and Submit order;
- disabled and enabled conditions;
- field-associated validation and correction;
- appropriate descriptions and security wording;
- focus movement and restoration;
- status and error announcements.

Run keyboard traversal and semantic snapshots for every task. Include screen-reader-oriented names, roles, states, descriptions, live regions, table sorting semantics, landmarks, and heading structure.

### Exit signal

The acceptance matrix passes against real rendered lifecycle transitions, not only query-string-forced static fixtures.

## Phase 5 — Motion pass

Motion begins only after positioning, responsive behavior, focus, and lifecycle transitions are stable.

Apply the PR motion direction:

- spatial movement uses an interruptible spring;
- frequent functional state changes remain immediate;
- opacity and colour use short transitions only when no spatial physics applies;
- passive scroll-spy updates do not animate layout;
- noninteractive posters do not imply clickability through lift;
- reduced motion preserves information and final state without blanket component overrides.

Verify interruption, rapid reversal, keyboard operation, reduced motion, and low-frequency functional updates in the browser.

## Phase 6 — Architecture and code-quality acceptance

Before final evidence:

1. Remove the rejected global component override layer.
2. Confirm remaining global CSS is limited to legitimate resets, tokens, font setup, product-wide background behavior, and accessibility rules that cannot be owned locally.
3. Search for descendant, structural, `[data-slot]`, and `!important` overrides introduced by the PR and justify or remove each one.
4. Review the complete diff for duplicate primitives, wrapper layers, fallback paths, and abstractions without domain meaning.
5. Run focused gates after each cleanup, then the complete repository gates.

### Exit signal

A component’s JSX and local variants explain its layout, responsive behavior, interaction states, and visual ownership without negotiating with a parallel global framework.

## Phase 7 — Independent review and repair loop

Run independent fresh-context reviews against the exact candidate head:

- capability and regression review;
- rendered visual and responsive review;
- UX, accessibility, and credential-flow review;
- architecture and maintainability review;
- motion review.

Give reviewers the issue, PR comments, acceptance matrix, repository rules, and exact head—not the implementer’s reasoning.

Send accepted findings to the single implementation writer, rerun affected gates, and re-review the resulting exact head. Stop when there are no blockers or fixes worth doing now, or when a user-owned decision appears.

## Phase 8 — Final evidence and PR update

Freeze the reviewed head before recording.

### Evidence-harness smoke test

Prove one complete recording path before producing the full set:

- dependencies and browser session;
- deterministic data seeding;
- semantic selectors;
- exact interaction script;
- output path;
- recorder finalisation;
- media/container inspection;
- start, middle, and end frame inspection;
- upload and playable rendering in the PR;
- process cleanup.

Repair the harness before bulk capture if any step fails.

### Final evidence

- Record matched before/after flows from equivalent data and actions.
- Replace every stale screenshot, video, audit, and verification claim.
- Verify that the PR renders media rather than exposing download-only links.
- Put the acceptance matrix results, commands, failures, limitations, and exact reviewed SHA in the PR.
- Run final capability retention, rendered acceptance, static gates, independent review, and media verification on the same head.
- Stop at the issue #327 prototype approval gate.

## Existing review coverage

The current PR reviews provide strong coverage of:

- wholesale redesign versus reskin;
- visual hierarchy, density, typography, controls, stock shadcn residue, system states, copy, and capability discoverability;
- responsive interaction design, navigation, filters, sorting, import, Ask AI, refresh, focus, and reduced motion;
- selected runtime lifecycle failures, scroll preservation, hydration mismatch, partial accounts, and mobile overflow;
- global stylesheet architecture and component ownership;
- current and missing motion opportunities.

## What the existing reviews do not establish

These areas require additional evidence or a separately approved scope. Their absence from the current reviews must not be interpreted as approval.

### Security and privacy beyond interaction design

The reviews identify unsafe NPSSO representation and task flow, but they do not provide a complete threat model or verify:

- transport and server/operator exposure;
- storage, logging, redaction, and retention behavior;
- token revocation and incident recovery;
- production security wording;
- broader application or dependency security.

Do not claim production security approval from this prototype review.

### Real external-service behavior

The reviews exercise stable and safe demo behavior, not exhaustive live PlayStation/RAWG behavior, rate limits, authentication expiry, service degradation, malformed responses, or production network recovery.

### Data correctness

The reviews verify visible capability and selected state behavior. They do not independently prove every aggregation, currency calculation, date interpretation, trophy calculation, session derivation, franchise grouping, prompt payload, or exported-data value against authoritative source data.

### Migration and persistence compatibility

The hydration addendum identifies one saved-account problem, but the reviews do not exhaustively validate old browser data, archive versions, storage migrations, corrupted persistence, downgrade/rollback behavior, or long-lived compatibility.

### Full accessibility conformance

The UX review identifies structural issues, but it is not a complete WCAG audit. Additional coverage is required for:

- screen-reader testing with representative assistive technology;
- zoom and text reflow;
- forced colours and high contrast;
- colour-contrast measurement;
- orientation and platform accessibility settings;
- complex table and long-page navigation announcements.

### Browser and device compatibility

The existing evidence is concentrated on the available Chromium browser and selected viewport sizes. It does not establish Safari, Firefox, iOS Safari, Android browser, touch/hover hybrids, coarse-pointer edge cases, safe areas, browser zoom, or device performance.

### Performance

No existing review attributes or approves startup time, hydration cost, interaction latency, scroll performance, memory use, image cost, animation frame stability, bundle impact, or behavior on low-end devices and large real datasets.

### Production operations

The reviews do not cover deployment, Cloudflare/runtime configuration, observability, analytics, monitoring, rollback, support procedures, or production incident behavior.

### Internationalisation and content governance

The copy review covers visible English wording and pluralisation defects. It does not establish localisation readiness, locale-sensitive dates/numbers/currencies, text expansion, translation, legal review, or content ownership.

### Final brand system

The final square Playloom brandmark remains explicitly deferred. The prototype review must not expand into final identity approval or imply that the temporary wordmark completes the brand system.

### Comprehensive code review outside the changed presentation surface

The reviews identify the CSS architecture defect and selected component problems. They are not an exhaustive maintainability, dependency, concurrency, data-layer, server, or repository-wide architecture review.

## Completion criteria

PR #337 is ready for the user’s prototype approval only when:

- the representative slice was explicitly approved before propagation;
- every acceptance-matrix row passes;
- all existing capabilities remain directly usable and discoverable;
- all interaction surfaces belong visibly and structurally to Playloom;
- loading, empty, error, partial, and no-results states remain inside the product shell with appropriate recovery;
- lifecycle, accessibility, credential-flow, responsive, and motion checks pass;
- the global component override layer is removed;
- project gates pass;
- independent reviewers approve the exact repaired head;
- final matched media is inspected, delivered, and rendered on that same head;
- the PR accurately states residual limitations and does not claim coverage from the areas explicitly excluded above;
- the work remains a draft prototype and is not merged or advanced into production implementation.
