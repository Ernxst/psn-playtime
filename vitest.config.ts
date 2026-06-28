import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/__tests__/**",
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
    },
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
        },
      },
      {
        extends: "./vite.config.ts",
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
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
