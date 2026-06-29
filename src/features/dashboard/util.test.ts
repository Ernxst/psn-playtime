import { describe, expect, it } from "vitest";
import { round, yearOf } from "./util";

describe(".round", () => {
  it.each([
    { n: 1.005, dp: 2, expected: 1 },
    { n: 100.499, dp: 2, expected: 100.5 },
    { n: 12.3456, dp: 1, expected: 12.3 },
    { n: 12.3456, dp: undefined, expected: 12 },
    { n: -1.555, dp: 2, expected: -1.55 },
  ])("rounds $n to $dp decimal places as $expected", ({ n, dp, expected }) => {
    expect(dp === undefined ? round(n) : round(n, dp)).toBe(expected);
  });
});

describe(".yearOf", () => {
  it.each([
    { date: "2021-06-01", expected: 2021 },
    { date: "2019-12-31T23:00:00Z", expected: 2019 },
    { date: "1999-01-01", expected: 1999 },
  ])("extracts $expected from $date", ({ date, expected }) => {
    expect(yearOf(date)).toBe(expected);
  });

  it("falls back to Date parsing for non-ISO-prefixed strings", () => {
    expect(yearOf("June 1, 2021")).toBe(2021);
  });

  it("returns undefined for an unparseable date", () => {
    expect(yearOf("not-a-real-date")).toBeUndefined();
  });
});
