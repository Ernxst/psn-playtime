import { describe, expect, it } from "vitest";
import { chartColor, fmtDate, fmtDuration, fmtHours, fmtNumber } from "./format";

describe(".fmtHours", () => {
  it("keeps one decimal for small totals", () => {
    expect(fmtHours(9.86)).toBe("9.9 h");
  });

  it("rounds to a whole number for totals of 10 or more", () => {
    expect(fmtHours(1253.62)).toBe("1,254 h");
  });

  it("formats exactly ten as a whole number", () => {
    expect(fmtHours(10)).toBe("10 h");
  });
});

describe(".fmtNumber", () => {
  it("formats with thousands separators and no decimals", () => {
    expect(fmtNumber(5966.4)).toBe("5,966");
  });
});

describe(".fmtDate", () => {
  it("renders a plain-English date", () => {
    expect(fmtDate("2022-09-15")).toBe("15 Sep 2022");
  });

  it("returns a dash for a missing value", () => {
    expect(fmtDate()).toBe("—");
  });

  it("returns a dash for an unparseable value", () => {
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe(".fmtDuration", () => {
  it("renders days for sub-year totals", () => {
    expect(fmtDuration(24 * 320)).toBe("320 days");
  });

  it("renders years once a year of hours is exceeded", () => {
    expect(fmtDuration(24 * 365 * 2)).toBe("2 years");
  });

  it("renders years at exactly one year of hours", () => {
    expect(fmtDuration(24 * 365)).toBe("1 years");
  });
});

describe(".chartColor", () => {
  it("maps an index to the matching chart var", () => {
    expect(chartColor(0)).toBe("var(--chart-1)");
    expect(chartColor(4)).toBe("var(--chart-5)");
  });

  it("cycles back through the five-colour palette", () => {
    expect(chartColor(5)).toBe("var(--chart-1)");
    expect(chartColor(6)).toBe("var(--chart-2)");
  });
});
