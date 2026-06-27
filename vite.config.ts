import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Security response headers, applied at the server layer (Nitro `routeRules`)
// so they are emitted on every host (not just Cloudflare Pages `_headers`).
//
// CSP is intentionally REPORT-ONLY for now: TanStack Start injects inline
// hydration scripts, so an enforcing `script-src` would break hydration.
// Report-only lets us observe violations first. Enforcing CSP (dropping
// `'unsafe-inline'` for scripts via nonces/hashes) is a deliberate follow-up.
const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; "),
  // HSTS is production-only: it must not be sent over plain HTTP in dev.
  ...(process.env.NODE_ENV === "production"
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
    : {}),
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: { "/**": { headers: securityHeaders } },
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  test: {
    testTimeout: 5000,
    restoreMocks: true,
    mockReset: true,
    unstubGlobals: true,
    expect: { requireAssertions: true },
    experimental: { fsModuleCache: true },
  },
});
