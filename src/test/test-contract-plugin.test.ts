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
  "no-test-yield",
  "no-boolean-expect",
  "no-finally",
  "no-control-flow",
  "no-assertion-in-callback",
  "no-mock-calls",
  "no-inexact-cardinality",
  "no-broad-dom-text",
  "no-dom-selector",
  "no-promise-constructor",
  "no-query-null-assertion",
  "no-optional-test-action",
  "no-internal-module-mock",
  "no-ambiguous-called-with",
  "no-callback-capture",
  "no-mock-implementation-shortcut",
  "no-global-mock-cleanup",
  "no-indirect-msw-overrides",
  "no-inline-msw-url",
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
    ["no-test-yield", `it("waits", () => requestAnimationFrame(run));`],
    ["no-test-yield", `it("waits", () => window.requestAnimationFrame(run));`],
    ["no-test-yield", `it("waits", () => queueMicrotask(run));`],
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
    ["no-dom-selector", `it("renders", () => view.querySelector("button"));`],
    ["no-dom-selector", `it("renders", () => view.querySelectorAll("button"));`],
    ["no-dom-selector", `it("renders", () => button.closest("form"));`],
    ["no-dom-selector", `it("renders", () => button.parentElement);`],
    ["no-promise-constructor", `it("waits", () => new Promise(resolve => resolve()));`],
    [
      "no-query-null-assertion",
      `it("hides", () => expect(page.getByRole("dialog").query()).toBeNull());`,
    ],
    ["no-optional-test-action", `it("clicks", () => button?.click());`],
    ["no-internal-module-mock", `vi.mock("@/server/provider");`],
    ["no-internal-module-mock", `vi.mock(import("@/server/provider"));`],
    ["no-ambiguous-called-with", `it("calls", () => expect(callback).toHaveBeenCalledWith(1));`],
    ["no-callback-capture", `it("calls", () => vi.fn((value) => { captured = value; }));`],
    [
      "no-mock-implementation-shortcut",
      `it("fails", () => callback.mockImplementation(() => { throw new Error("failure"); }));`,
    ],
    ["no-global-mock-cleanup", `it("cleans up", () => vi.restoreAllMocks());`],
    [
      "no-indirect-msw-overrides",
      `const useSearch = (resolver) => server.use(http.get(RAWG_GAMES_URL, resolver));`,
    ],
    [
      "no-indirect-msw-overrides",
      `function useSeries(resolver) { server.use(http.get(RAWG_SERIES_URL, resolver)); }`,
    ],
    ["no-inline-msw-url", `http.all("https://example.test/games", resolver);`],
    ["no-inline-msw-url", `http.delete("https://example.test/games", resolver);`],
    ["no-inline-msw-url", `http.get("https://example.test/games", resolver);`],
    ["no-inline-msw-url", `http.head("https://example.test/games", resolver);`],
    ["no-inline-msw-url", `http.options("https://example.test/games", resolver);`],
    ["no-inline-msw-url", `http.patch("https://example.test/games", resolver);`],
    ["no-inline-msw-url", "http.post(`http://${host}/games`, resolver);"],
    ["no-inline-msw-url", `http.put("https://example.test/games", resolver);`],
    ["no-inline-msw-url", 'http[`get`]("https://example.test/games", resolver);'],
  ])("rejects %s", (rule, source) => {
    const result = lint(source);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`test-contract(${rule})`);
  });

  it("accepts exact observable assertions, MSW boundaries, and canonical targets", () => {
    const result = lint(`
      afterEach(() => vi.restoreAllMocks());
      vi.waitFor(callback);
      server.use(http.get(SHARED_ENDPOINT, resolver));
      beforeAll(() => {
        const register = () => server.use(http.get(endpointFor("games"), resolver));
        register();
      });
      beforeEach(() => {
        const register = () => server.use(http.get(endpointFor("games"), resolver));
        register();
      });
      it("renders the expected items", () => {
        const register = () => server.use(http.get(SHARED_ENDPOINT, resolver));
        register();
        expect(elements).toHaveLength(2);
        expect(view).toHaveTextContent("Ready");
      });
      it.each([1, 2])("registers case %s", () => {
        server.use(http.get(SHARED_ENDPOINT, resolver));
      });
      test("registers directly", () => {
        server.use(http.get(SHARED_ENDPOINT, resolver));
      });
      test.each([1, 2])("registers test case %s", () => {
        server.use(http.get(SHARED_ENDPOINT, resolver));
      });
      client.get("https://example.test/games");
      client["get"]("https://example.test/games");
      const method = "connect";
      http[method]("https://example.test/games", resolver);
      http.get(dynamicTarget, resolver);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
