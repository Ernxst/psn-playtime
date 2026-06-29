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
    projects: ["./vitest.node.config.ts", "./vitest.browser.config.ts"],
  },
});
