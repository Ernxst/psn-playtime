import { describe, expect, it } from "vitest";
import { bookmarkletHref, countStabilised } from "./transaction-bookmarklet";
import { HANDOFF_COMPLETE_TYPE, HANDOFF_MESSAGE_TYPE } from "./transactions";

function bookmarkletBody(origin: string): string {
  return decodeURIComponent(bookmarkletHref(origin).replace(/^javascript:/, ""));
}

describe(".countStabilised", () => {
  it.each([
    { stableRounds: 0, spinnerVisible: false, expected: false },
    { stableRounds: 1, spinnerVisible: false, expected: false },
    { stableRounds: 2, spinnerVisible: false, expected: true },
    { stableRounds: 3, spinnerVisible: false, expected: true },
    { stableRounds: 2, spinnerVisible: true, expected: false },
    { stableRounds: 5, spinnerVisible: true, expected: false },
  ])(
    "is $expected when stableRounds=$stableRounds and spinnerVisible=$spinnerVisible",
    ({ stableRounds, spinnerVisible, expected }) => {
      expect(countStabilised(stableRounds, spinnerVisible)).toBe(expected);
    }
  );
});

describe(".bookmarkletHref", () => {
  it("produces a javascript: URI whose body embeds the lazy-load scroll helpers", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("findScrollableAncestor");
    expect(body).toContain("resolveScrollContainer");
    expect(body).toContain("countStabilised");
    expect(body).toContain("scrollToBottom");
  });

  it("streams each batch via window.open postMessage and signals completion", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("window.open");
    expect(body).toContain("flush");
    expect(body).toContain(JSON.stringify(HANDOFF_MESSAGE_TYPE));
    expect(body).toContain(JSON.stringify(HANDOFF_COMPLETE_TYPE));
  });

  it("retains the one-shot fragment redirect as the popup-blocked fallback", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("fragmentRedirect");
    expect(body).toContain("loadAll");
    expect(body).toContain("#data=");
  });

  it("embeds the prefixed scroll-diagnostic tracing", () => {
    const body = bookmarkletBody("https://psn.example.dev");

    expect(body).toContain("[psn-import]");
    expect(body).toContain("dumpScrollDiagnostics");
    expect(body).toContain("doScrollPass");
  });
});
