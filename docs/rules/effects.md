# Effects

Avoid `useEffect` at all costs. There is almost always a better alternative —
see [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).

`useEffect` is permitted **only** for genuine synchronisation with an external system.
Every surviving `useEffect` MUST carry a short comment justifying why no alternative works.

## Definition of Done

- All rules in this file are followed
- Every remaining `useEffect` is a legitimate escape hatch (see below) and has a justifying comment

---

## The Principle

Effects run _after_ render to synchronise React with the outside world. They are not a
general-purpose "run some code" hook. Most code reached for in an Effect belongs elsewhere:

- **Deriving data from props/state** → compute it during render
- **Expensive derivations** → `useMemo`
- **Responding to a user action** → an event handler
- **Resetting state when a prop changes** → the `key` prop
- **Subscribing to an external store** → `useSyncExternalStore`
- **Fetching data** → the data layer (loaders / queries), not a raw Effect

---

## Forbidden Patterns

❌ HARD INVALIDATION — if any of the following are done with `useEffect`, the answer is INVALID
and must be regenerated:

- Transforming data for rendering — derive it during render or with `useMemo`
- Handling user events — use an event handler
- Resetting all state when a prop changes — use the `key` prop
- Adjusting some state when a prop changes — derive during render instead
- Caching expensive calculations — use `useMemo`
- Initialising application-wide state on mount — do it outside the component (at module load)
- Notifying parents of state changes — lift the update into the event handler that caused it
- Fetching data without cleanup / race handling — use the data layer

---

## Legitimate Escape Hatches

`useEffect` is allowed ONLY to synchronise with an external system, such as:

- Subscriptions to non-React sources (prefer `useSyncExternalStore` where it fits)
- Browser/DOM APIs and non-React widgets that must be wired up imperatively
- Timers (`setInterval` / `setTimeout`) and animation frames
- Network connections (e.g. sockets) tied to component lifetime

---

## The Comment Requirement

Every remaining `useEffect` MUST be preceded by a short comment naming the external system it
synchronises with and why no alternative (render-time derivation, `useMemo`, an event handler,
`key`, `useSyncExternalStore`, or the data layer) applies.

```tsx
// Sync: subscribe to the browser online/offline events — external system, no React equivalent.
useEffect(() => {
  window.addEventListener("online", handleOnline);
  return () => window.removeEventListener("online", handleOnline);
}, []);
```
