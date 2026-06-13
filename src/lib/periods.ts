// Reporting-period presets (QuickBooks-style) that resolve to a {from, to}
// date range. Pure date math in UTC so the same code runs on the server
// (authoritative dates) and in the client picker (instant fill). Fiscal
// periods derive from the business's fiscalYearStart (month 1-12).

export type PeriodKey =
  | "all"
  | "custom"
  | "today"
  | "this-week"
  | "this-week-to-date"
  | "this-month"
  | "this-month-to-date"
  | "this-quarter"
  | "this-quarter-to-date"
  | "this-year"
  | "this-year-to-date"
  | "this-year-to-last-month"
  | "this-fiscal-quarter"
  | "this-fiscal-quarter-to-date"
  | "this-fiscal-year"
  | "this-fiscal-year-to-date"
  | "this-fiscal-year-to-last-month";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All dates" },
  { key: "custom", label: "Custom dates" },
  { key: "today", label: "Today" },
  { key: "this-week", label: "This week" },
  { key: "this-week-to-date", label: "This week to date" },
  { key: "this-month", label: "This month" },
  { key: "this-month-to-date", label: "This month to date" },
  { key: "this-quarter", label: "This quarter" },
  { key: "this-quarter-to-date", label: "This quarter to date" },
  { key: "this-year", label: "This year" },
  { key: "this-year-to-date", label: "This year to date" },
  { key: "this-year-to-last-month", label: "This year to last month" },
  { key: "this-fiscal-quarter", label: "This fiscal quarter" },
  { key: "this-fiscal-quarter-to-date", label: "This fiscal quarter to date" },
  { key: "this-fiscal-year", label: "This fiscal year" },
  { key: "this-fiscal-year-to-date", label: "This fiscal year to date" },
  { key: "this-fiscal-year-to-last-month", label: "This fiscal year to last month" },
];

const DAY = 86400000;
const fmt = (d: Date) => d.toISOString().slice(0, 10);
/** Date from an absolute month index (year*12 + monthIdx) and day-of-month. */
const ym = (monthAbs: number, day: number) =>
  new Date(Date.UTC(Math.floor(monthAbs / 12), monthAbs % 12, day));

export type PeriodRange = { from?: string; to?: string };

/**
 * Server-side: turn a submitted (period, from, to) into the effective ISO
 * range. A named period wins (recomputed authoritatively); "custom"/unset
 * falls back to the explicit from/to.
 */
export function resolvePeriod(
  period: string | undefined,
  explicitFrom: string | undefined,
  explicitTo: string | undefined,
  todayIso: string,
  fiscalStartMonth: number
): { from?: string; to?: string; period: string } {
  if (period && period !== "custom") {
    const r = periodRange(period as PeriodKey, todayIso, fiscalStartMonth);
    if (r) return { from: r.from, to: r.to, period };
  }
  return { from: explicitFrom || undefined, to: explicitTo || undefined, period: period || "custom" };
}

/**
 * Resolve a preset to an ISO {from, to} range relative to `todayIso`
 * (YYYY-MM-DD). Returns `null` for "custom" (caller keeps explicit dates) and
 * `{}` for "all" (no bounds). `fiscalStartMonth` is 1-12.
 */
export function periodRange(
  key: PeriodKey,
  todayIso: string,
  fiscalStartMonth: number
): PeriodRange | null {
  if (key === "custom") return null;
  if (key === "all") return {};

  const [ty, tm, td] = todayIso.split("-").map(Number); // tm is 1-12
  const today = new Date(Date.UTC(ty, tm - 1, td));
  const monthAbs = ty * 12 + (tm - 1); // current month, absolute
  const fsIdx = fiscalStartMonth - 1; // 0-based fiscal start month
  const TODAY = fmt(today);
  const lastDayPrevMonth = fmt(ym(monthAbs, 0)); // day 0 of this month

  switch (key) {
    case "today":
      return { from: TODAY, to: TODAY };

    case "this-week":
    case "this-week-to-date": {
      const start = new Date(today.getTime() - today.getUTCDay() * DAY); // Sunday
      return {
        from: fmt(start),
        to: key === "this-week" ? fmt(new Date(start.getTime() + 6 * DAY)) : TODAY,
      };
    }

    case "this-month":
    case "this-month-to-date":
      return {
        from: fmt(ym(monthAbs, 1)),
        to: key === "this-month" ? fmt(ym(monthAbs + 1, 0)) : TODAY,
      };

    case "this-quarter":
    case "this-quarter-to-date": {
      const qStart = monthAbs - ((tm - 1) % 3);
      return {
        from: fmt(ym(qStart, 1)),
        to: key === "this-quarter" ? fmt(ym(qStart + 3, 0)) : TODAY,
      };
    }

    case "this-year":
      return { from: fmt(ym(ty * 12, 1)), to: fmt(ym(ty * 12 + 12, 0)) };
    case "this-year-to-date":
      return { from: fmt(ym(ty * 12, 1)), to: TODAY };
    case "this-year-to-last-month":
      return { from: fmt(ym(ty * 12, 1)), to: lastDayPrevMonth };

    case "this-fiscal-quarter":
    case "this-fiscal-quarter-to-date": {
      const fyStartMonthAbs = monthAbs >= ty * 12 + fsIdx ? ty * 12 + fsIdx : (ty - 1) * 12 + fsIdx;
      const monthsIn = monthAbs - fyStartMonthAbs;
      const fqStart = fyStartMonthAbs + Math.floor(monthsIn / 3) * 3;
      return {
        from: fmt(ym(fqStart, 1)),
        to: key === "this-fiscal-quarter" ? fmt(ym(fqStart + 3, 0)) : TODAY,
      };
    }

    case "this-fiscal-year":
    case "this-fiscal-year-to-date":
    case "this-fiscal-year-to-last-month": {
      const fyStartMonthAbs = monthAbs >= ty * 12 + fsIdx ? ty * 12 + fsIdx : (ty - 1) * 12 + fsIdx;
      const from = fmt(ym(fyStartMonthAbs, 1));
      if (key === "this-fiscal-year") return { from, to: fmt(ym(fyStartMonthAbs + 12, 0)) };
      if (key === "this-fiscal-year-to-last-month") return { from, to: lastDayPrevMonth };
      return { from, to: TODAY };
    }
  }
}
