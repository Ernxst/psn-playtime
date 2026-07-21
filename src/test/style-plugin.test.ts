import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";

const oxlint = fileURLToPath(new URL("../../node_modules/.bin/oxlint", import.meta.url));
const plugin = fileURLToPath(new URL("../../tools/oxlint/style.mjs", import.meta.url));

function lint(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "style-plugin-"));
  const fixture = join(directory, "fixture.ts");
  const config = join(directory, ".oxlintrc.json");
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(fixture, source);
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [plugin],
      rules: { "style/prefer-concise-arrow": "error" },
    })
  );
  return spawnSync(oxlint, ["--config", config, "--format", "unix", fixture], {
    encoding: "utf8",
  });
}

describe("style/prefer-concise-arrow", () => {
  it.each([
    `onTestFinished(() => { vi.useRealTimers(); });`,
    `const assign = () => (target = value);`,
    `const assign = () => void (target = value);`,
  ])("rejects %s", (source) => {
    const result = lint(source);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("style(prefer-concise-arrow)");
  });

  it.each([
    `it("works", () => { run(); });`,
    `it.each([])("works", () => { run(); });`,
    `(() => { start(); finish(); })();`,
    `(() => { task()\n  .then(finish); })();`,
  ])("accepts %s", (source) => {
    const result = lint(source);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
