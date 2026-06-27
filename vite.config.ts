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
// Content-Security-Policy is NOT set here: it carries a per-request nonce and is
// emitted on the SSR document response from `src/server.ts` via `buildCsp`. A
// static header would duplicate (and weaken) that policy.
const securityHeaders: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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
