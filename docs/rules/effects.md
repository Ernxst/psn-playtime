# React effects

Use `useEffect` only to synchronise a component with a non-React system when React has no declarative integration.

Use the mechanism that owns the work instead:

- derive render data during render; use `useMemo` only for expensive derivation
- handle user actions in event handlers
- reset component state with a `key`
- subscribe to values read during render with `useSyncExternalStore`
- fetch through loaders or queries

A valid effect may own a socket, imperative browser API, non-React widget, analytics event, or similar external lifetime. It must clean up owned resources and carry a short comment naming the external system and why an event handler, render-time derivation, or `useSyncExternalStore` does not apply.
