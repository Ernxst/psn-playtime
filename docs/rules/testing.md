# Testing

You MUST follow existing testing patterns. Test: initial render, user interactions, edge cases.

## Definition of Done

- All rules in this file are followed
- Tests pass: `bun run test`
- No forbidden APIs used

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
- Extracted test harnesses, wrapper functions, or fixture helpers to reduce repetition — inline setup only
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

- Put tests in a `__tests__/` directory next to the file under test
- One behaviour per test; multiple assertions allowed if cohesive
- Prefer table-driven tests for input permutations
- Arrange–Act–Assert structure

## Test Framework

- Prefer `Promise.withResolvers()` over `new Promise(...)` for deferred promises in tests

## Test Names

- Must read as complete English sentences without a full stop (completing "It …")
  - ❌ `it('renders the form.', ...)`. ✅ `it('renders the form', ...)`. The name must NOT end with punctuation.
- Use British English

## Test Grouping

- Group by **public API surface**
- Function tests: top-level `describe` must be `.functionName` e.g. `describe(".hashThumbnail")`

---

## Mocking Policy

- **Default**: no mocks, spies, stubs, or test doubles
- Do not mock anything defined in this repo — if untestable without mocking internal code → refactor
- Never add test-only helpers to source files — put them in the test file or a co-located test helper
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

- Prefer inline setup — keeps tests self-contained
- Use `beforeEach` only for expensive setup identical across all tests in the block (e.g. starting a server)
- Never use `beforeEach` for convenience — repeat setup inline instead
- Never extract test harnesses or wrapper functions to reduce repetition — prefer explicit inline setup even if duplicated.
  - Exception: helpers that exercise a code path the public API intentionally prevents (e.g. simulating corrupt state).
