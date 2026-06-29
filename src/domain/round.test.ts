import { describe, expect, it } from "vitest";
import { round } from "./round";

describe(".round", () => {
  it.each([
    [0.5, 0, 1],
    [1.5, 0, 2],
    [2.5, 0, 3],
    [-0.5, 0, -0],
    [-1.5, 0, -1],
    [1.4, 0, 1],
    [1.6, 0, 2],
    [0, 0, 0],
    [-0, 0, -0],
    [123, 0, 123],
    [-123, 0, -123],
  ])("rounds %d to %d decimal places as %d", (n, dp, expected) => {
    expect(round(n, dp)).toBe(expected);
  });

  it("defaults to whole numbers when no decimal places are given", () => {
    expect(round(3.7)).toBe(4);
  });

  it.each([
    [1.255, 2, 1.25],
    [2.675, 2, 2.68],
    [1.2345, 3, 1.235],
    [1.2345, 2, 1.23],
    [-1.2345, 2, -1.23],
    [1253.6249, 2, 1253.62],
  ])("rounds %d to %d decimal places as %d", (n, dp, expected) => {
    expect(round(n, dp)).toBe(expected);
  });

  it("rounds negative values toward the nearer integer", () => {
    expect(round(-2.4)).toBe(-2);
  });

  it("preserves positive infinity", () => {
    expect(round(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("preserves negative infinity", () => {
    expect(round(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("returns NaN for a NaN input", () => {
    expect(round(Number.NaN)).toBeNaN();
  });
});
