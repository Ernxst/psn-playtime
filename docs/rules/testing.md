# Testing

Test observable behaviour: initial state, user interactions, and meaningful edge cases. Do not test implementation details, type-system guarantees, or lines for coverage.

This app uses co-located Vitest node and browser tests. Mechanical constraints for matchers, timers, control flow, callback inspection, cleanup, formatting, and mocks are enforced by [`tools/oxlint/test-contract.json`](../../tools/oxlint/test-contract.json).

## Structure and names

- Co-locate `*.test.ts(x)` and `*.browser.test.tsx` beside the code under test.
- Keep one cohesive behaviour per test; use `it.each` or `describe.each` for input permutations.
- Put shared MSW handlers, fixtures, and the minimal router/query harness in `src/test/`.
- Use `it`, not `test`. Names complete “It …” in British English and have no trailing punctuation.
- Group function tests under `describe(".functionName")`, constant-only modules under a descriptive surface name, and browser tests under the exported component name.

## Boundaries and test doubles

- Prefer real code and browser APIs. Never mock repository providers, transports, domain wrappers, or other internal modules.
- Mock network services with central MSW handlers at the HTTP boundary, then override them per test.
- A non-network third-party seam without a real test context may be mocked minimally.
- Browser tests may mock the generated TanStack server-function client proxy only when the isolated browser project has no TanStack Start host. Integration-test its server effect separately through the real provider and MSW-backed network boundary.
- Simulate browser API failures only when they cannot be triggered naturally. Use local or in-memory infrastructure and temporary directories where applicable.
- Keep test-only helpers in the test or `src/test/`. Never change production code solely to expose a test seam.

## Design

- Prefer inline, test-specific arrangement. Use `beforeEach` only for expensive setup shared unchanged by every test in the block.
- Prefer `Promise.withResolvers()` for deferred promises.
- Assert exact observable values through semantic or accessible queries.
- Use `onTestFinished` for resources owned by one test. Use `afterEach` for shared mock restoration.
