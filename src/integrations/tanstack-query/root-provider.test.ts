import type { MockInstance } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWindowStub } from "@/test/web-storage";

afterEach(() => {
  vi.resetModules();
});

/** Net `window.addEventListener`/`removeEventListener` calls for the `storage` event. */
function storageListenerCalls(spy: MockInstance): number {
  return spy.mock.calls.filter(([type]) => type === "storage").length;
}

describe("getContext", () => {
  it("reuses one app-lifetime registry across browser context reconstructions", async () => {
    vi.stubGlobal("window", createWindowStub());
    const { getContext } = await import("./root-provider");

    const first = getContext();
    const second = getContext();

    expect(second.atomRegistry).toBe(first.atomRegistry);
  });

  it("leaves exactly one window storage listener after two browser context constructions", async () => {
    const win = createWindowStub();
    const addEventListener = vi.spyOn(win, "addEventListener");
    const removeEventListener = vi.spyOn(win, "removeEventListener");
    vi.stubGlobal("window", win);
    const { getContext } = await import("./root-provider");

    getContext();
    getContext();

    await vi.waitFor(() => {
      expect(storageListenerCalls(addEventListener)).toBe(1);
    });
    expect(storageListenerCalls(addEventListener) - storageListenerCalls(removeEventListener)).toBe(
      1
    );
  });

  it("creates a fresh registry per request on the server", async () => {
    const { getContext } = await import("./root-provider");

    const first = getContext();
    const second = getContext();

    expect(second.atomRegistry).not.toBe(first.atomRegistry);
  });
});
