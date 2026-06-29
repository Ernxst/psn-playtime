import { describe, expect, it } from "vitest";
import { computeTotals, type TotalsInput } from "./totals";

const play = (over: Partial<TotalsInput> = {}): TotalsInput => ({
  hours: 0,
  playCount: 0,
  ...over,
});

describe(".computeTotals", () => {
  it("returns zeroed totals and no span for an empty library", () => {
    expect(computeTotals([])).toEqual({
      totalGames: 0,
      totalHours: 0,
      totalSessions: 0,
      firstEverPlayed: undefined,
      span: { from: undefined, to: undefined },
    });
  });

  it("counts games, hours and sessions across the library", () => {
    const totals = computeTotals([
      play({ hours: 1.5, playCount: 2 }),
      play({ hours: 2.25, playCount: 3 }),
    ]);
    expect(totals.totalGames).toBe(2);
    expect(totals.totalHours).toBe(3.75);
    expect(totals.totalSessions).toBe(5);
  });

  it("rounds total hours to two decimal places", () => {
    const totals = computeTotals([play({ hours: 0.001 }), play({ hours: 0.004 })]);
    expect(totals.totalHours).toBe(0.01);
  });

  it("derives the earliest first-play regardless of input order", () => {
    const totals = computeTotals([
      play({ firstPlayed: "2022-05-01" }),
      play({ firstPlayed: "2019-01-09" }),
      play({ firstPlayed: "2021-12-31" }),
    ]);
    expect(totals.firstEverPlayed).toBe("2019-01-09");
    expect(totals.span.from).toBe("2019-01-09");
  });

  it("derives the latest last-play as the span end", () => {
    const totals = computeTotals([
      play({ lastPlayed: "2020-03-04" }),
      play({ lastPlayed: "2024-11-20" }),
      play({ lastPlayed: "2023-07-15" }),
    ]);
    expect(totals.span.to).toBe("2024-11-20");
  });

  it("ignores games missing first- or last-played dates when forming the span", () => {
    const totals = computeTotals([
      play({ firstPlayed: "2020-01-01", lastPlayed: "2020-06-01" }),
      play({ hours: 5 }),
      play({ firstPlayed: "2018-02-02", lastPlayed: "2022-09-09" }),
    ]);
    expect(totals.firstEverPlayed).toBe("2018-02-02");
    expect(totals.span).toEqual({ from: "2018-02-02", to: "2022-09-09" });
  });

  it("leaves the span open when no game carries dates", () => {
    const totals = computeTotals([play({ hours: 3, playCount: 1 })]);
    expect(totals.firstEverPlayed).toBeUndefined();
    expect(totals.span).toEqual({ from: undefined, to: undefined });
  });
});
