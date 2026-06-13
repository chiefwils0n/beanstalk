import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney, parseDate, toDateInput } from "../src/lib/money";

describe("parseMoney", () => {
  it("parses plain and formatted dollar strings to integer cents", () => {
    expect(parseMoney("10.00")).toBe(1000);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("0.13")).toBe(13);
    expect(parseMoney("")).toBe(0);
  });

  it("accepts a numeric dollar amount", () => {
    expect(parseMoney(1234.56)).toBe(123456);
    expect(parseMoney(0)).toBe(0);
  });

  it("throws on non-numeric input", () => {
    expect(() => parseMoney("abc")).toThrow();
  });
});

describe("formatMoney", () => {
  it("formats integer cents as USD", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-500)).toBe("-$5.00");
  });

  it("round-trips with parseMoney for representative values", () => {
    for (const cents of [0, 13, 1000, 123456, 6900000]) {
      expect(parseMoney(formatMoney(cents))).toBe(cents);
    }
  });
});

describe("dates (UTC)", () => {
  it("round-trips yyyy-mm-dd through parseDate/toDateInput", () => {
    expect(toDateInput(parseDate("2026-01-31"))).toBe("2026-01-31");
    expect(toDateInput(parseDate("2028-02-29"))).toBe("2028-02-29");
  });

  it("parses as a UTC midnight instant", () => {
    expect(parseDate("2026-06-13").toISOString()).toBe("2026-06-13T00:00:00.000Z");
  });

  it("throws on an invalid date", () => {
    expect(() => parseDate("not-a-date")).toThrow();
  });
});
