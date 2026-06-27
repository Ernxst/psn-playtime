import { describe, expect, it } from "vitest";
import { bookmarkletHref, countStabilised } from "./transaction-bookmarklet";

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
    const body = decodeURIComponent(
      bookmarkletHref("https://psn.example.dev").replace(/^javascript:/, "")
    );

    expect(body).toContain("findScrollableAncestor");
    expect(body).toContain("countStabilised");
    expect(body).toContain("scrollToBottom");
  });
});
