import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Per-test behaviour previously supplied to both projects by
// `vite.config.ts`'s `test` block via `extends`. Extending the app config also
// pulled in its server plugin stack (`nitro`, `tanstackStart`, `devtools`),
// which booted a dev server / file watcher that never tore down and left ~50
// leaked FILEHANDLEs, hanging teardown for the full `close timed out after
// 10000ms` window on every run (#239). We drop `extends` and re-declare only
// what tests need. These options must live INSIDE each project's `test` block:
// Vitest does not propagate root-level `test` options (e.g. `mockReset`,
// `restoreMocks`) into `projects`, so a root-only declaration would silently
// break per-test isolation.
const testDefaults = {
  testTimeout: 5000,
  restoreMocks: true,
  mockReset: true,
  unstubGlobals: true,
  expect: { requireAssertions: true },
  experimental: { fsModuleCache: true },
} as const;

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/__screenshots__/**",
        "src/main.tsx",
        "src/main.ts",
        "src/test/**",
        "src/vite-env.d.ts",
        // Vendored / generated / scaffold — not our code to cover (mirrors lint/knip ignores).
        "src/components/ui/**",
        "src/routeTree.gen.ts",
        "src/router.tsx",
        "src/integrations/**",
      ],
      // CI coverage floor: fail the suite if coverage regresses below these
      // ratchet levels (set just under current achieved to leave slack). #18.
      thresholds: {
        statements: 95,
        branches: 73,
        functions: 88,
        lines: 95,
      },
    },
    projects: [
      {
        // `@/` alias resolution (was provided by `vite.config.ts`'s
        // `resolve.tsconfigPaths` via `extends`). Node tests need only the
        // alias + Vite's default esbuild TS/JSX transform — no app plugins.
        resolve: { tsconfigPaths: true },
        test: {
          ...testDefaults,
          name: "node",
          setupFiles: ["./src/test/msw.ts"],
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.browser.test.tsx"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        // Browser tests render components, so they keep React, the
        // React-compiler babel preset, and Tailwind — but not the app-only
        // server plugins that caused #239.
        plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
        test: {
          ...testDefaults,
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          // Compile + inject the app's Tailwind entry stylesheet so rendered
          // components report real computed styles. The CSS import is handled by
          // this project's existing `tailwindcss()` plugin — no app-server
          // plugins are pulled in, so #239's teardown leak does not return.
          setupFiles: ["./src/test/load-styles.ts"],
          // Cap the browser pool and run it in its own sequence group so its
          // Playwright workers don't spin up alongside the node project (whose
          // heavy esbuild-in-`vm` test, `transaction-bookmarklet.test.ts`,
          // competes for the same FDs/ports). Unbounded, overlapping browser
          // parallelism exhausted sandbox FDs/ports under load (`listen EPERM` /
          // `EMFILE`), flaking unrelated files run-to-run (#120). A distinct
          // `groupOrder` runs the node group first, then the capped browser
          // group, so the two pools never contend.
          maxWorkers: 3,
          sequence: { groupOrder: 1 },
          browser: {
            enabled: true,
            connectTimeout: 5000,
            instances: [{ browser: "chromium" }],
            provider: playwright({ actionTimeout: 3000 }),
          },
        },
      },
    ],
  },
});
