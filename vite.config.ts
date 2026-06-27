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
// CSP is ENFORCED (not report-only): the policy locks the origin down to a
// strict allow-list. `script-src` keeps `'unsafe-inline'` because TanStack
// Start injects inline hydration scripts; dropping it requires per-request
// nonces and is tracked as a deliberate follow-up (#36).
const securityHeaders: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Content-Security-Policy": [
    "upgrade-insecure-requests",
    "default-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.playstation.net https://*.playstation.com https://*.np.community.playstation.net",
    // Web fonts are self-hosted (see `src/styles.css`), so they load same-origin.
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self'",
  ].join("; "),
  // HSTS is production-only: it must not be sent over plain HTTP in dev.
  ...(process.env.NODE_ENV === "production"
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload" }
    : {}),
};

// Self-hosted `@fontsource-variable/*` fonts ship split into many small
// per-unicode-range woff2 files. Vite inlines any asset under
// `build.assetsInlineLimit` (default 4 KB) as a `data:` URI, which the strict
// `font-src 'self'` CSP blocks. Force every font to be emitted as a
// same-origin asset file; defer to Vite's default for all other assets.
const FONT_EXTENSIONS = /\.(woff2?|ttf|otf|eot)$/i;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    assetsInlineLimit: (filePath) => (FONT_EXTENSIONS.test(filePath) ? false : undefined),
  },
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
