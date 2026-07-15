import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { formatCountdown, getUtcDateString, msUntilNextUtcDay } from "../src/date";

describe("getUtcDateString", () => {
  it("formats a mid-year UTC date with zero-padded month and day", () => {
    expect(getUtcDateString(new Date("2026-07-15T12:00:00Z"))).toBe("2026-07-15");
  });

  it("uses the UTC calendar day, not the local one, near midnight", () => {
    // 23:30 UTC on the 15th is still the 15th in UTC regardless of the
    // host machine's local timezone.
    expect(getUtcDateString(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-15");
    expect(getUtcDateString(new Date("2026-07-16T00:30:00Z"))).toBe("2026-07-16");
  });

  it("zero-pads single-digit months and days", () => {
    expect(getUtcDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("handles a leap day", () => {
    expect(getUtcDateString(new Date("2028-02-29T00:00:00Z"))).toBe("2028-02-29");
  });

  it("handles the year boundary", () => {
    expect(getUtcDateString(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(getUtcDateString(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });
});

describe("msUntilNextUtcDay", () => {
  it("returns a full day at exactly UTC midnight", () => {
    expect(msUntilNextUtcDay(new Date("2026-07-15T00:00:00.000Z"))).toBe(24 * 60 * 60 * 1000);
  });

  it("returns the exact remainder mid-day", () => {
    // 12:00:00 UTC -> 12h left.
    expect(msUntilNextUtcDay(new Date("2026-07-15T12:00:00.000Z"))).toBe(12 * 60 * 60 * 1000);
  });

  it("returns a small remainder just before midnight", () => {
    expect(msUntilNextUtcDay(new Date("2026-07-15T23:59:59.500Z"))).toBe(500);
  });

  it("rolls over the UTC year boundary", () => {
    expect(msUntilNextUtcDay(new Date("2026-12-31T23:00:00.000Z"))).toBe(60 * 60 * 1000);
  });
});

describe("formatCountdown", () => {
  it("formats a duration as zero-padded HH:MM:SS", () => {
    expect(formatCountdown(3661_000)).toBe("01:01:01");
  });

  it("formats zero as 00:00:00", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
  });

  it("clamps a negative duration to zero instead of going negative", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });

  it("rounds sub-second remainders to the nearest second", () => {
    expect(formatCountdown(59_600)).toBe("00:01:00");
  });

  it("handles durations past 24 hours without wrapping the hour field", () => {
    expect(formatCountdown(25 * 60 * 60 * 1000)).toBe("25:00:00");
  });
});

describe("date property tests", () => {
  // Roughly years 2000-2050, any millisecond within that span.
  const anyTimestamp = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2050, 0, 1) });

  it("msUntilNextUtcDay always returns a value in (0, 24h]", () => {
    fc.assert(
      fc.property(anyTimestamp, (ts) => {
        const ms = msUntilNextUtcDay(new Date(ts));
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      }),
    );
  });

  it("getUtcDateString followed by re-parsing round-trips to the same UTC day", () => {
    fc.assert(
      fc.property(anyTimestamp, (ts) => {
        const date = new Date(ts);
        const dateString = getUtcDateString(date);
        const reparsed = new Date(`${dateString}T00:00:00Z`);
        expect(reparsed.getUTCFullYear()).toBe(date.getUTCFullYear());
        expect(reparsed.getUTCMonth()).toBe(date.getUTCMonth());
        expect(reparsed.getUTCDate()).toBe(date.getUTCDate());
      }),
    );
  });

  it("formatCountdown never emits a negative or malformed string for any non-negative input", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 * 60 * 60 * 24 * 400 }), (ms) => {
        expect(formatCountdown(ms)).toMatch(/^\d{2,}:\d{2}:\d{2}$/);
      }),
    );
  });

  it("formatCountdown is monotonically non-decreasing in whole seconds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (ms) => {
        const a = formatCountdown(ms);
        const b = formatCountdown(ms + 1000);
        expect(b >= a).toBe(true);
      }),
    );
  });
});
