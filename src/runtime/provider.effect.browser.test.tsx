import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { appNameAtom } from "./atoms.effect";
import { EffectAtomProvider } from "./provider.effect";

// Module-scoped so the selector reference is stable across renders.
const selectAppName = AsyncResult.getOrElse(() => "loading");

function AppName() {
  const appName = useAtomValue(appNameAtom, selectAppName);
  return <p>{appName}</p>;
}

describe("EffectAtomProvider", () => {
  it("the atom provider resolves the example service through an atom", async () => {
    await render(
      <EffectAtomProvider>
        <AppName />
      </EffectAtomProvider>
    );

    await expect.element(page.getByText("psn-playtime")).toBeVisible();
  });
});
