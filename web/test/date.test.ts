import { describe, expect, it } from "vitest";
import { getUtcDateString } from "../src/date";

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
