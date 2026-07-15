import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { getUtcDateString } from "../src/date";
import {
  activeStreak,
  loadResult,
  nextStreak,
  previousUtcDateString,
  saveResult,
  type DailyResult,
} from "../src/storage";

function result(overrides: Partial<DailyResult> = {}): DailyResult {
  return {
    won: true,
    sweepsUsed: 1,
    sweepBudget: 4,
    outcomes: ["decoy", "lock"],
    streak: 1,
    ...overrides,
  };
}

describe("previousUtcDateString", () => {
  it("returns the day before, mid-month", () => {
    expect(previousUtcDateString("2026-07-15")).toBe("2026-07-14");
  });

  it("rolls back across a month boundary", () => {
    expect(previousUtcDateString("2026-08-01")).toBe("2026-07-31");
  });

  it("rolls back across a year boundary", () => {
    expect(previousUtcDateString("2027-01-01")).toBe("2026-12-31");
  });

  it("handles a leap day correctly", () => {
    expect(previousUtcDateString("2028-03-01")).toBe("2028-02-29");
  });

  it("is always exactly one calendar day before, for any date in a 50-year span", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2000, 0, 2), max: Date.UTC(2050, 0, 1) }),
        (ts) => {
          const date = getUtcDateString(new Date(ts));
          const prev = previousUtcDateString(date);
          const expected = getUtcDateString(new Date(ts - 24 * 60 * 60 * 1000));
          expect(prev).toBe(expected);
        },
      ),
    );
  });
});

describe("nextStreak", () => {
  it("starts at 1 on the very first completed puzzle", () => {
    expect(nextStreak(null, true)).toBe(1);
    expect(nextStreak(null, false)).toBe(1);
  });

  it("increments a win that continues yesterday's win", () => {
    expect(nextStreak(result({ won: true, streak: 4 }), true)).toBe(5);
  });

  it("restarts at 1 after a gap (yesterday has no result) even on a win", () => {
    expect(nextStreak(null, true)).toBe(1);
  });

  it("restarts at 1 after yesterday's loss, even on a win today", () => {
    expect(nextStreak(result({ won: false, streak: 1 }), true)).toBe(1);
  });

  it("restarts at 1 on a loss today, regardless of yesterday", () => {
    expect(nextStreak(result({ won: true, streak: 7 }), false)).toBe(1);
  });
});

describe("activeStreak", () => {
  it("shows today's streak once today is complete", () => {
    expect(activeStreak(result({ streak: 3 }), null)).toBe(3);
  });

  it("shows yesterday's streak carried in when today isn't played yet", () => {
    expect(activeStreak(null, result({ won: true, streak: 5 }))).toBe(5);
  });

  it("shows 0 when yesterday was a loss and today isn't played", () => {
    expect(activeStreak(null, result({ won: false, streak: 1 }))).toBe(0);
  });

  it("shows 0 when there's no history at all", () => {
    expect(activeStreak(null, null)).toBe(0);
  });
});

describe("loadResult / saveResult", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for a date that was never played", () => {
    expect(loadResult("2026-07-15")).toBeNull();
  });

  it("round-trips a saved result", () => {
    const r = result({ won: false, sweepsUsed: 4, streak: 1 });
    saveResult("2026-07-15", r);
    expect(loadResult("2026-07-15")).toEqual(r);
  });

  it("keeps distinct dates independent", () => {
    saveResult("2026-07-14", result({ streak: 3 }));
    saveResult("2026-07-15", result({ streak: 4 }));
    expect(loadResult("2026-07-14")?.streak).toBe(3);
    expect(loadResult("2026-07-15")?.streak).toBe(4);
  });

  it("treats corrupted stored JSON as no history instead of throwing", () => {
    localStorage.setItem("signal-jam:results", "{not json");
    expect(() => loadResult("2026-07-15")).not.toThrow();
    expect(loadResult("2026-07-15")).toBeNull();
  });

  it("degrades gracefully when localStorage.setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded");
    });
    expect(() => saveResult("2026-07-15", result())).not.toThrow();
    spy.mockRestore();
  });

  it("discards a hand-edited entry missing required fields instead of returning a partial object", () => {
    localStorage.setItem(
      "signal-jam:results",
      JSON.stringify({ "2026-07-15": { won: true, streak: 2 } }),
    );
    expect(loadResult("2026-07-15")).toBeNull();
  });

  it("discards an entry whose outcomes contain a value outside the known set", () => {
    localStorage.setItem(
      "signal-jam:results",
      JSON.stringify({
        "2026-07-15": {
          won: true,
          sweepsUsed: 1,
          sweepBudget: 4,
          streak: 1,
          outcomes: ["decoy", "banana"],
        },
      }),
    );
    expect(loadResult("2026-07-15")).toBeNull();
  });

  it("keeps a well-formed entry alongside a discarded malformed one", () => {
    localStorage.setItem(
      "signal-jam:results",
      JSON.stringify({
        "2026-07-14": { won: true, streak: "not a number" },
        "2026-07-15": result({ streak: 5 }),
      }),
    );
    expect(loadResult("2026-07-14")).toBeNull();
    expect(loadResult("2026-07-15")?.streak).toBe(5);
  });
});
