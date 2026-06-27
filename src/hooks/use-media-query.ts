"use client";

import { useCallback, useSyncExternalStore } from "react";

// The sidebar's only breakpoint need: below Tailwind's `md` (800px) is "mobile".
const MOBILE_MAX_WIDTH = 799;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

function getServerSnapshot(): boolean {
  return false;
}

/** SSR-safe hook: true when the viewport is below the `md` breakpoint. */
export function useMediaQuery(_query: "max-md"): boolean {
  const subscribe = useCallback((callback: () => void) => {
    // Defensive SSR guard; subscribe only runs client-side where window exists.
    /* v8 ignore start */
    if (typeof window === "undefined") return () => {};
    /* v8 ignore stop */
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    // Defensive SSR guard; getSnapshot only runs client-side where window exists.
    /* v8 ignore start */
    if (typeof window === "undefined") return false;
    /* v8 ignore stop */
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
