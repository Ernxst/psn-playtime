import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";

const oxlint = fileURLToPath(new URL("../../node_modules/.bin/oxlint", import.meta.url));
const plugin = fileURLToPath(new URL("../../tools/oxlint/test-contract.mjs", import.meta.url));
const rules = [
  "no-wait-for",
  "no-test-timers",
  "no-boolean-expect",
  "no-finally",
  "no-control-flow",
  "no-assertion-in-callback",
  "no-mock-calls",
  "no-inexact-cardinality",
  "no-broad-dom-text",
  "no-internal-module-mock",
  "no-ambiguous-called-with",
  "no-callback-capture",
  "no-mock-implementation-shortcut",
  "no-global-mock-cleanup",
] as const;

function lint(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "test-contract-"));
  const fixture = join(directory, "fixture.test.ts");
  const config = join(directory, ".oxlintrc.json");
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(fixture, source);
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [plugin],
      rules: Object.fromEntries(rules.map((name) => [`test-contract/${name}`, "error"])),
    })
  );

  return spawnSync(oxlint, ["--config", config, "--format", "unix", fixture], {
    encoding: "utf8",
  });
}

describe("test-contract", () => {
  it.each([
    ["no-wait-for", `it("waits", () => waitFor(() => expect(value).toBe(1)));`],
    ["no-test-timers", `it("waits", () => setTimeout(run, 10));`],
    ["no-boolean-expect", `it("compares", () => expect(actual === expected).toBe(true));`],
    ["no-finally", `it("cleans up", () => task().finally(cleanup));`],
    ["no-control-flow", `it("branches", () => { if (ready) expect(value).toBe(1); });`],
    ["no-assertion-in-callback", `it("calls", () => vi.fn(() => expect(value).toBe(1)));`],
    ["no-mock-calls", `it("calls", () => expect(callback.mock.calls[0]).toEqual([]));`],
    [
      "no-inexact-cardinality",
      `it("counts", () => expect(elements.length).toBeGreaterThanOrEqual(1));`,
    ],
    ["no-broad-dom-text", `it("renders", () => expect(view.textContent).toContain("Ready"));`],
    ["no-internal-module-mock", `vi.mock("@/server/provider");`],
    ["no-internal-module-mock", `vi.mock(import("@/server/provider"));`],
    ["no-ambiguous-called-with", `it("calls", () => expect(callback).toHaveBeenCalledWith(1));`],
    ["no-callback-capture", `it("calls", () => vi.fn((value) => { captured = value; }));`],
    [
      "no-mock-implementation-shortcut",
      `it("fails", () => callback.mockImplementation(() => { throw new Error("failure"); }));`,
    ],
    ["no-global-mock-cleanup", `it("cleans up", () => vi.restoreAllMocks());`],
  ])("rejects %s", (rule, source) => {
    const result = lint(source);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`test-contract(${rule})`);
  });

  it("accepts exact observable assertions and hook-scoped cleanup", () => {
    const result = lint(`
      afterEach(() => vi.restoreAllMocks());
      vi.waitFor(callback);
      it("renders the expected items", () => {
        expect(elements).toHaveLength(2);
        expect(view).toHaveTextContent("Ready");
      });
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
