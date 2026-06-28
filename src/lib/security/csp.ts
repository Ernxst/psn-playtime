// Single source of truth for the Content-Security-Policy emitted on the SSR
// document response (see `src/server.ts`). CSP is ENFORCED (not report-only).
//
// `script-src` is the only env-dependent directive:
//   - prod: `'self' 'nonce-<n>' 'wasm-unsafe-eval'` — no `'unsafe-inline'`. The
//     nonce is generated per request and stamped on every inline tag TanStack
//     Start emits (via `router.options.ssr.nonce`), so hydration scripts match.
//   - dev: keep `'unsafe-inline'` because Vite's React-refresh preamble injects
//     an inline `<script>` that TSS does not nonce; a nonce-only policy would
//     break HMR.
//
// `style-src 'unsafe-inline'` and `'wasm-unsafe-eval'` are intentionally kept
// (out of scope for #36).

const SCRIPT_SRC_PROD = (nonce: string) => `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`;
const SCRIPT_SRC_DEV = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";

export function buildCsp({ nonce }: { nonce: string }): string {
  return [
    "upgrade-insecure-requests",
    "default-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    import.meta.env.PROD ? SCRIPT_SRC_PROD(nonce) : SCRIPT_SRC_DEV,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.playstation.net https://*.playstation.com https://*.np.community.playstation.net",
    // Web fonts are self-hosted (see `src/styles.css`), so they load same-origin.
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self'",
  ].join("; ");
}
