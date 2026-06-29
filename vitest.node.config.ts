import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.browser.test.tsx"],
    testTimeout: 5000,
    restoreMocks: true,
    mockReset: true,
    unstubGlobals: true,
    expect: { requireAssertions: true },
    experimental: { fsModuleCache: true },
  },
});
