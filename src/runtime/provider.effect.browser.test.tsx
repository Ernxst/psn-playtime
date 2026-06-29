import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { TestAtomProvider } from "@/test/atom-registry";
import { appNameAtom } from "./atoms.effect";

// Module-scoped so the selector reference is stable across renders.
const selectAppName = AsyncResult.getOrElse(() => "loading");

function AppName() {
  const appName = useAtomValue(appNameAtom, selectAppName);
  return <p>{appName}</p>;
}

describe("EffectAtomProvider", () => {
  it("the atom provider resolves the example service through an atom", async () => {
    await render(
      <TestAtomProvider>
        <AppName />
      </TestAtomProvider>
    );

    await expect.element(page.getByText("psn-playtime")).toBeVisible();
  });
});
