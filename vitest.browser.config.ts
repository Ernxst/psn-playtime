import { playwright } from "@vitest/browser-playwright";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
  test: {
    name: "browser",
    include: ["src/**/*.browser.test.tsx"],
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
});
