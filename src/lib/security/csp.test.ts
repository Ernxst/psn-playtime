import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp } from "./csp";

const scriptSrcOf = (csp: string): string =>
  csp.split("; ").find((directive) => directive.startsWith("script-src")) ?? "";

describe(".buildCsp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits a nonce-based script-src without unsafe-inline in production", () => {
    vi.stubEnv("PROD", true);

    expect(scriptSrcOf(buildCsp({ nonce: "abc123" }))).toBe(
      "script-src 'self' 'nonce-abc123' 'wasm-unsafe-eval'"
    );
  });

  it("keeps unsafe-inline in script-src during development", () => {
    vi.stubEnv("PROD", false);

    expect(scriptSrcOf(buildCsp({ nonce: "abc123" }))).toBe(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
    );
  });

  it("emits the shared locked-down directives regardless of environment", () => {
    vi.stubEnv("PROD", true);

    const csp = buildCsp({ nonce: "abc123" });

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
