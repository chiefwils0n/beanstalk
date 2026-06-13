import { describe, it, expect } from "vitest";
import { periodRange, resolvePeriod, PERIOD_GROUPS, NEEDS_N } from "../src/lib/periods";

// Fixed "today" so the relative presets are deterministic. 2026-06-13 is a
// Saturday, in calendar Q2. fiscalStartMonth defaults to 1 (Jan) below, so
// fiscal == calendar unless a different start is passed.
const TODAY = "2026-06-13";
const r = (key: string, fiscalStart = 1, n?: number) => periodRange(key, TODAY, fiscalStart, n);

describe("periodRange — custom / all", () => {
  it("returns null for custom presets (caller keeps explicit dates)", () => {
    expect(r("custom")).toBeNull();
    expect(r("custom-fiscal-period")).toBeNull();
  });
  it("returns an empty range for all dates", () => {
    expect(r("all")).toEqual({});
  });
});

describe("periodRange — day", () => {
  it("today / yesterday / tomorrow", () => {
    expect(r("today")).toEqual({ from: "2026-06-13", to: "2026-06-13" });
    expect(r("yesterday")).toEqual({ from: "2026-06-12", to: "2026-06-12" });
    expect(r("tomorrow")).toEqual({ from: "2026-06-14", to: "2026-06-14" });
  });
  it("last N days counts back inclusive of today", () => {
    expect(r("last-n-days", 1, 30)).toEqual({ from: "2026-05-15", to: "2026-06-13" });
    expect(r("last-7-days")).toEqual({ from: "2026-06-07", to: "2026-06-13" });
  });
});

describe("periodRange — week (Sunday start)", () => {
  it("this week spans the Sunday..Saturday containing today", () => {
    // 2026-06-13 is Saturday → week is 2026-06-07 (Sun) .. 2026-06-13 (Sat)
    expect(r("this-week")).toEqual({ from: "2026-06-07", to: "2026-06-13" });
    expect(r("this-week-to-date")).toEqual({ from: "2026-06-07", to: "2026-06-13" });
    expect(r("last-week")).toEqual({ from: "2026-05-31", to: "2026-06-06" });
  });
});

describe("periodRange — month", () => {
  it("this / last month and to-date", () => {
    expect(r("this-month")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(r("this-month-to-date")).toEqual({ from: "2026-06-01", to: "2026-06-13" });
    expect(r("last-month")).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(r("last-month-to-date")).toEqual({ from: "2026-05-01", to: "2026-05-13" });
  });
  it("last N complete months end at the prior month-end", () => {
    expect(r("last-3-months")).toEqual({ from: "2026-03-01", to: "2026-05-31" });
    expect(r("last-12-months")).toEqual({ from: "2025-06-01", to: "2026-05-31" });
    expect(r("last-n-months", 1, 6)).toEqual({ from: "2025-12-01", to: "2026-05-31" });
  });
});

describe("periodRange — quarter (calendar)", () => {
  it("this quarter is Q2; last quarter is Q1", () => {
    expect(r("this-quarter")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(r("this-quarter-to-date")).toEqual({ from: "2026-04-01", to: "2026-06-13" });
    expect(r("last-quarter")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(r("next-quarter")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
});

describe("periodRange — year (calendar) + tax aliases", () => {
  it("this / last / next year", () => {
    expect(r("this-year")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(r("this-year-to-date")).toEqual({ from: "2026-01-01", to: "2026-06-13" });
    expect(r("last-year")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("last N complete years end at last year-end", () => {
    expect(r("last-2-years")).toEqual({ from: "2024-01-01", to: "2025-12-31" });
    expect(r("last-n-years", 1, 5)).toEqual({ from: "2021-01-01", to: "2025-12-31" });
  });
  it("tax-period presets use the calendar year / quarter", () => {
    expect(r("current-tax-year")).toEqual(r("this-year"));
    expect(r("prior-tax-year")).toEqual(r("last-year"));
    expect(r("current-tax-quarter")).toEqual(r("this-quarter"));
    expect(r("prior-tax-quarter")).toEqual(r("last-quarter"));
  });
});

describe("periodRange — fiscal year follows fiscalStartMonth", () => {
  it("with a calendar fiscal start (Jan) fiscal == calendar", () => {
    expect(r("this-fiscal-year", 1)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("with a July (7) fiscal start", () => {
    // 2026-06-13 is before July, so the current fiscal year began 2025-07-01.
    expect(r("this-fiscal-year", 7)).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(r("this-fiscal-year-to-date", 7)).toEqual({ from: "2025-07-01", to: "2026-06-13" });
    expect(r("last-fiscal-year", 7)).toEqual({ from: "2024-07-01", to: "2025-06-30" });
    expect(r("next-fiscal-year", 7)).toEqual({ from: "2026-07-01", to: "2027-06-30" });
  });
});

describe("resolvePeriod", () => {
  it("named period wins and is recomputed authoritatively", () => {
    expect(resolvePeriod("this-month", "2000-01-01", "2000-01-02", TODAY, 1)).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-30",
      period: "this-month",
    });
  });
  it("custom / unknown falls back to explicit dates", () => {
    expect(resolvePeriod("custom", "2026-01-01", "2026-03-31", TODAY, 1)).toMatchObject({
      from: "2026-01-01",
      to: "2026-03-31",
      period: "custom",
    });
    expect(resolvePeriod(undefined, undefined, undefined, TODAY, 1)).toMatchObject({
      period: "custom",
    });
  });
  it("defaults the N count when absent", () => {
    expect(resolvePeriod("last-n-days", undefined, undefined, TODAY, 1).n).toBe(30);
  });
});

describe("menu metadata", () => {
  it("exposes 8 groups and flags the Last-N presets", () => {
    expect(PERIOD_GROUPS).toHaveLength(8);
    expect(NEEDS_N.has("last-n-months")).toBe(true);
    expect(NEEDS_N.has("this-month")).toBe(false);
  });
});
