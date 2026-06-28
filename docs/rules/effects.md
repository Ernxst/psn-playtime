# Effects

Avoid `useEffect` at all costs. There is almost always a better alternative —
see [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).

`useEffect` is permitted **only** for true fire-and-forget side effects that push to a
non-React system whose result you do **not** read during render — e.g. connecting to a
server or socket, imperatively driving a non-React widget, or firing analytics on a
lifecycle moment. Anything you subscribe to or read back during render is
`useSyncExternalStore`'s job, **not** `useEffect`'s. Every surviving `useEffect` MUST carry
a short comment justifying why no alternative works.

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

`useEffect` is allowed ONLY for a true fire-and-forget side effect: one that pushes to a
non-React system and whose result you do **not** read during render, such as:

- Opening a network connection (e.g. a socket) tied to component lifetime
- Imperatively wiring up a browser/DOM API or non-React widget that has no declarative API
- Firing analytics or logging on a mount/unmount lifecycle moment

If you instead need the external value **during render** — online/offline status, a store's
current value, the viewport size — that is `useSyncExternalStore`, **not** `useEffect`. And
when a user interaction is what triggers the side effect, prefer an event handler over an
Effect.

---

## The Comment Requirement

Every remaining `useEffect` MUST be preceded by a short comment that names the non-React
system it pushes to and explains why render-time derivation, an event handler, and
`useSyncExternalStore` all fail to apply — not merely that it "talks to an external system".
In particular it must say why the value is never read during render (so `useSyncExternalStore`
is wrong) and why no user interaction triggers it (so an event handler is wrong).

```tsx
// Fire-and-forget: open a chat socket for this room's lifetime. Nothing here is read during
// render (so not useSyncExternalStore); no user interaction triggers it (so not an event
// handler); there is nothing to derive.
useEffect(() => {
  const socket = createConnection(roomId);
  socket.connect();
  return () => socket.disconnect();
}, [roomId]);
```
