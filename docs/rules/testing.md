# Testing

You MUST follow existing testing patterns. Test: initial render, user interactions, edge cases.

## Definition of Done

- All rules in this file are followed
- Tests pass: `pnpm test`
- No forbidden APIs used

> Project note: this app is TanStack Start + Vitest (node + browser/Playwright projects). Tests are
> **co-located** and shared test infrastructure (MSW handlers, fixtures, a minimal router/query
> harness) is **allowed** — see File Structure, Mocking Policy, and Setup below.

---

## Forbidden Patterns/APIs

❌ HARD INVALIDATION — if any of the following are used, the answer is INVALID and must be regenerated:

- `waitFor`
- Vague assertions: `toBeTruthy()`, `toBeFalsy()`
- `setTimeout` / `setInterval` — use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` instead
- Asserting inside mock callbacks
- Storing callback arguments in outer variables for later inspection
- Boolean expressions in `expect()` — assert values directly using the appropriate matcher
- Production source files modified solely to aid testability
- `.finally()` for per-test teardown
- Testing what the TypeScript compiler can catch
- `vi.resetModules()` / `vi.restoreAllMocks()` outside of `onTestFinished` or `afterEach` — use the appropriate cleanup hook instead
- Mocking our own repo code / wrappers (e.g. `@/server/*`) — mock the third-party SDK or the network (MSW) it delegates to instead
- `mockImplementation` for throwing errors - use `mockThrow` instead
- `mockImplementation(promise)` for returning a promise - use `mockReturnValue(promise)` instead
- `expect(await promise).to...` - use `await expect(promise).resolves.to...` or extract the resolved value into a variable
- Side-effectful variable assignments
- `await new Promise((r) => setTimeout(r, delay))`
- `await Promise.resolve()` to get 'next tick' behaviour
- `expect(mockFn).toHaveBeenCalled()` - assertions must assert on how many times the mock was called
  - Exception: no equivalent user event helper (e.g., file upload cancel)
- `toHaveBeenCalledTimes(0)` - use `not.toHaveBeenCalled()`
- `toHaveBeenCalledTimes(1)` with `toHaveBeenCalledWith` - use `toHaveBeenCalledExactlyOnceWith`

---

## File Structure

- **Co-locate** tests next to the file under test: `*.test.ts` / `*.test.tsx` (node project) and `*.browser.test.tsx` (browser project)
- One behaviour per test; multiple assertions allowed if cohesive
- Prefer table-driven tests for input permutations
- Arrange–Act–Assert structure
- Shared test infrastructure lives in `src/test/` (MSW handlers, fixtures, the router/query harness)

## Test Framework

- Prefer `Promise.withResolvers()` over `new Promise(...)` for deferred promises in tests

## Test Names

- Must read as complete English sentences without a full stop (completing "It …")
  - ❌ `it('renders the form.', ...)`. ✅ `it('renders the form', ...)`. The name must NOT end with punctuation.
- Use British English

## Test Grouping

- Group by **public API surface**
- Function tests: top-level `describe` must be `.functionName` e.g. `describe(".hashThumbnail")`
- Constant tests: a module that exports only constants (no functions) groups its constants under a single descriptive `describe` for that surface, e.g. `describe("seo constants")`

---

## Mocking Policy

- **Default**: no mocks, spies, stubs, or test doubles
- Do not mock anything defined in this repo — if untestable without mocking internal code → refactor
- **Network is mocked with MSW**, not ad-hoc `fetch`/SDK stubs: intercept the real third-party HTTP (RAWG, psn-api's requests) at the network boundary. Centralise handlers in `src/test/` and override per-test. This is the one sanctioned place to "mock" — it stands in for the real third-party service, never for our own code.
- Non-network third-party seams with no real test context (e.g. the `@tanstack/react-start/server` cookie helpers) may be module-mocked minimally, or driven via the shared request-context helper.
- Never add test-only helpers to source files — put them in the test file or under `src/test/`
- Never refactor source code solely to make it testable via dependency injection — if the real implementation is testable, test it directly

### Third-party and browser APIs

- Mock **only** to simulate failure paths that cannot be triggered naturally in a real browser
- Otherwise test against real browser APIs — tests run in a real browser
- Keep mocks minimal — no behavioural reimplementation
- Use in-memory or local instances for infrastructure (databases, queues)
- Use temporary directories for file I/O
- Inject time/randomness via interfaces only when crossing an external boundary
- Spy on browser APIs when verifying that a layer or wrapper correctly delegates to them, or to simulate failure paths that cannot be triggered naturally

### Rule

Never mock your wrapper. Only mock the real third-party SDK call it delegates to.

---

## Assertions

- Exact assertions: `toBe()`, `toEqual()`, `toStrictEqual()`
- `toHaveAttribute` instead of `getAttribute`
- `toHaveProperty(key, expect.any(Function))` to assert property + type in one assertion
- `toBeInstanceOf(Function)` not `typeof value === "function"`
- `toMatchObject` or `toHaveProperty` for object shape — not `Object.keys()` comparisons
- Use `toSatisfy(predicate)` for boolean predicate assertions — not `expect(fn(value)).toBe(true/false)`
- Do not assert inside `act()` — run updates, then assert after it returns

---

## Callbacks and Mocks

- Use `vi.fn()` to mock methods
- Use `vi.spyOn` to spy on callbacks
- ALWAYS assert call count with `toHaveBeenCalledTimes()` when verifying callback behaviour
- NEVER assert `toHaveBeenCalledWith` without also asserting `toHaveBeenCalledTimes`
- NEVER use `spy.mock.calls` — use `toHaveBeenCalledWith` / `toHaveBeenNthCalledWith` / `toHaveBeenLastCalledWith`
- NEVER use `mockImplementation` to throw errors - use `mockThrow`

### Callback Assertion Pattern

❌ Forbidden — asserting inside the mock:

```js
const onClick = vi.fn((arg) => {
  expect(arg).toBe("foo");
});
```

❌ Forbidden — storing args in outer variables:

```js
let savedArg;
const onClick = vi.fn((arg) => {
  savedArg = arg;
});
// ...
expect(savedArg).toBe("foo");
```

✅ Correct:

```js
const onClick = vi.fn();
await userEvent.click(screen.getByRole("button"));
expect(onClick).toHaveBeenCalledTimes(1);
expect(onClick).toHaveBeenCalledWith("foo");
```

---

## Test Patterns

- NEVER use `try`/`catch` or `if` in tests
- Use `it.each` / `describe.each` for parameterised tests — never loop with `forEach` or `for` over expects
- Use `onTestFinished` for resource cleanup (runtimes, connections) — never `.finally()` or `afterEach`; `afterEach` is acceptable for mock restoration e.g. `vi.restoreAllMocks()`
- Never write tests that only assert a value is defined or has a certain size — if the TypeScript compiler can catch it, don't test it
- Test all observable behaviour — coverage follows naturally; never write a test solely to hit a line

### Spacing

- Declare all `vi.fn()` mocks together at the top of the test, no non-mock variables between them
- Add blank lines between tests, between render and queries, and before assertion groups

### Setup

- Prefer inline setup for test-specific arrangement — keeps tests self-contained
- Use `beforeEach` only for expensive setup identical across all tests in the block (e.g. starting a server)
- Never use `beforeEach` for convenience — repeat test-specific setup inline instead
- **Shared infrastructure is allowed and centralised in `src/test/`**: MSW handlers + server, reusable `DashboardData`/PSN/RAWG **fixtures** and builders, and a minimal **router + query harness** for rendering route/components that need context. Use these instead of duplicating provider/MSW boilerplate in every test; keep per-test data/arrangement inline on top of them.
