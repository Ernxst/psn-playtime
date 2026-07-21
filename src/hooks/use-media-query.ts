"use client";

import { useCallback, useSyncExternalStore } from "react";

const MEDIA_QUERIES = {
  "coarse-pointer": "(pointer: coarse)",
  "max-md": "(max-width: 767px)",
} as const;

function getServerSnapshot(): boolean {
  return false;
}

/** SSR-safe hook: true when the viewport is below the `md` breakpoint. */
export function useMediaQuery(query: keyof typeof MEDIA_QUERIES): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      // Defensive SSR guard; subscribe only runs client-side where window exists.
      /* v8 ignore start */
      if (typeof window === "undefined") return () => {};
      /* v8 ignore stop */
      const mql = window.matchMedia(MEDIA_QUERIES[query]);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    // Defensive SSR guard; getSnapshot only runs client-side where window exists.
    /* v8 ignore start */
    if (typeof window === "undefined") return false;
    /* v8 ignore stop */
    return window.matchMedia(MEDIA_QUERIES[query]).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
