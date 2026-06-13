// Reporting-period presets (QuickBooks-style) that resolve to a {from, to}
// date range. Pure UTC date math so the same code runs on the server
// (authoritative dates) and in the client picker (instant fill).
//
// - Fiscal periods derive from the business fiscalYearStart (month 1-12).
// - Tax periods use the calendar year / calendar quarter.
// - LAST_N_* take a count `n`; days count back inclusive of today, while
//   weeks/months/quarters/years mean the N complete prior periods.

export type PeriodOption = { key: string; label: string; needsN?: boolean };
export type PeriodGroup = { label: string; options: PeriodOption[] };

export const PERIOD_GROUPS: PeriodGroup[] = [
  {
    label: "Custom",
    options: [
      { key: "all", label: "All dates" },
      { key: "custom", label: "Custom dates" },
    ],
  },
  {
    label: "Day",
    options: [
      { key: "today", label: "Today" },
      { key: "yesterday", label: "Yesterday" },
      { key: "tomorrow", label: "Tomorrow" },
      { key: "last-n-days", label: "Last N days", needsN: true },
    ],
  },
  {
    label: "Week",
    options: [
      { key: "this-week", label: "This week" },
      { key: "this-week-to-date", label: "This week to date" },
      { key: "last-week", label: "Last week" },
      { key: "last-week-to-date", label: "Last week to date" },
      { key: "next-week", label: "Next week" },
      { key: "next-4-weeks", label: "Next 4 weeks" },
      { key: "last-7-days", label: "Last 7 days" },
      { key: "last-14-days", label: "Last 14 days" },
      { key: "last-30-days", label: "Last 30 days" },
      { key: "last-n-weeks", label: "Last N weeks", needsN: true },
    ],
  },
  {
    label: "Month",
    options: [
      { key: "this-month", label: "This month" },
      { key: "this-month-to-date", label: "This month to date" },
      { key: "last-month", label: "Last month" },
      { key: "last-month-to-date", label: "Last month to date" },
      { key: "next-month", label: "Next month" },
      { key: "next-3-months", label: "Next 3 months" },
      { key: "last-3-months", label: "Last 3 months" },
      { key: "last-6-months", label: "Last 6 months" },
      { key: "last-12-months", label: "Last 12 months" },
      { key: "last-18-months", label: "Last 18 months" },
      { key: "last-24-months", label: "Last 24 months" },
      { key: "last-n-months", label: "Last N months", needsN: true },
    ],
  },
  {
    label: "Quarter",
    options: [
      { key: "this-quarter", label: "This quarter" },
      { key: "this-quarter-to-date", label: "This quarter to date" },
      { key: "last-quarter", label: "Last quarter" },
      { key: "last-quarter-to-date", label: "Last quarter to date" },
      { key: "next-quarter", label: "Next quarter" },
      { key: "next-4-quarters", label: "Next 4 quarters" },
      { key: "last-4-quarters", label: "Last 4 quarters" },
      { key: "last-n-quarters", label: "Last N quarters", needsN: true },
    ],
  },
  {
    label: "Year",
    options: [
      { key: "this-year", label: "This year" },
      { key: "this-year-to-date", label: "This year to date" },
      { key: "last-year", label: "Last year" },
      { key: "last-year-to-date", label: "Last year to date" },
      { key: "next-year", label: "Next year" },
      { key: "last-2-years", label: "Last 2 years" },
      { key: "last-3-years", label: "Last 3 years" },
      { key: "last-5-years", label: "Last 5 years" },
      { key: "last-10-years", label: "Last 10 years" },
      { key: "last-n-years", label: "Last N years", needsN: true },
    ],
  },
  {
    label: "Fiscal year",
    options: [
      { key: "this-fiscal-year", label: "This fiscal year" },
      { key: "this-fiscal-year-to-date", label: "This fiscal year to date" },
      { key: "last-fiscal-year", label: "Last fiscal year" },
      { key: "last-fiscal-year-to-date", label: "Last fiscal year to date" },
      { key: "next-fiscal-year", label: "Next fiscal year" },
    ],
  },
  {
    label: "Tax period",
    options: [
      { key: "current-tax-year", label: "Current tax year" },
      { key: "current-tax-year-to-date", label: "Current tax year to date" },
      { key: "prior-tax-year", label: "Prior tax year" },
      { key: "prior-tax-year-to-date", label: "Prior tax year to date" },
      { key: "current-tax-quarter", label: "Current tax quarter" },
      { key: "prior-tax-quarter", label: "Prior tax quarter" },
    ],
  },
];

/** Keys that require an N count (show a number input). */
export const NEEDS_N = new Set(
  PERIOD_GROUPS.flatMap((g) => g.options.filter((o) => o.needsN).map((o) => o.key))
);

const DAY = 86400000;
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** Date from an absolute month index (year*12 + monthIdx) and day-of-month. */
const ym = (monthAbs: number, day: number) =>
  new Date(Date.UTC(Math.floor(monthAbs / 12), ((monthAbs % 12) + 12) % 12, day));
/** Last day of the month at absolute index. */
const monthEnd = (monthAbs: number) => ym(monthAbs + 1, 0);

export type PeriodRange = { from?: string; to?: string };

/**
 * Resolve a preset to an ISO {from, to} range relative to `todayIso`
 * (YYYY-MM-DD). Returns `null` for custom presets and `{}` for "all".
 * `fiscalStartMonth` is 1-12; `n` is used by LAST_N_* presets.
 */
export function periodRange(
  key: string,
  todayIso: string,
  fiscalStartMonth: number,
  n = 1
): PeriodRange | null {
  if (key === "custom" || key === "custom-fiscal-period") return null;
  if (key === "all") return {};
  const count = Math.max(1, Math.floor(n) || 1);

  const [ty, tm, td] = todayIso.split("-").map(Number); // tm 1-12
  const tmIdx = tm - 1;
  const today = new Date(Date.UTC(ty, tmIdx, td));
  const TODAY = fmt(today);
  const monthAbs = ty * 12 + tmIdx;
  const dow = today.getUTCDay(); // 0 = Sunday
  const weekStart = addDays(today, -dow);
  const qStartAbs = ty * 12 + Math.floor(tmIdx / 3) * 3;
  const fsIdx = fiscalStartMonth - 1;
  const fyStartAbs = monthAbs >= ty * 12 + fsIdx ? ty * 12 + fsIdx : (ty - 1) * 12 + fsIdx;

  // prior-period "to date": prior start through the same elapsed point as
  // today, capped at the prior period's end.
  const toDate = (priorStart: Date, currentStart: Date, priorEnd: Date) => {
    const elapsed = Math.round((today.getTime() - currentStart.getTime()) / DAY);
    const candidate = addDays(priorStart, elapsed);
    return candidate.getTime() > priorEnd.getTime() ? priorEnd : candidate;
  };

  switch (key) {
    // ---- day
    case "today":
      return { from: TODAY, to: TODAY };
    case "yesterday":
      return { from: fmt(addDays(today, -1)), to: fmt(addDays(today, -1)) };
    case "tomorrow":
      return { from: fmt(addDays(today, 1)), to: fmt(addDays(today, 1)) };
    case "last-n-days":
      return { from: fmt(addDays(today, -(count - 1))), to: TODAY };
    case "last-7-days":
      return { from: fmt(addDays(today, -6)), to: TODAY };
    case "last-14-days":
      return { from: fmt(addDays(today, -13)), to: TODAY };
    case "last-30-days":
      return { from: fmt(addDays(today, -29)), to: TODAY };

    // ---- week (Sunday start)
    case "this-week":
      return { from: fmt(weekStart), to: fmt(addDays(weekStart, 6)) };
    case "this-week-to-date":
      return { from: fmt(weekStart), to: TODAY };
    case "last-week":
      return { from: fmt(addDays(weekStart, -7)), to: fmt(addDays(weekStart, -1)) };
    case "last-week-to-date":
      return { from: fmt(addDays(weekStart, -7)), to: fmt(addDays(weekStart, -7 + dow)) };
    case "next-week":
      return { from: fmt(addDays(weekStart, 7)), to: fmt(addDays(weekStart, 13)) };
    case "next-4-weeks":
      return { from: fmt(addDays(weekStart, 7)), to: fmt(addDays(weekStart, 34)) };
    case "last-n-weeks":
      return { from: fmt(addDays(weekStart, -7 * count)), to: fmt(addDays(weekStart, -1)) };

    // ---- month
    case "this-month":
      return { from: fmt(ym(monthAbs, 1)), to: fmt(monthEnd(monthAbs)) };
    case "this-month-to-date":
      return { from: fmt(ym(monthAbs, 1)), to: TODAY };
    case "last-month":
      return { from: fmt(ym(monthAbs - 1, 1)), to: fmt(monthEnd(monthAbs - 1)) };
    case "last-month-to-date": {
      const end = monthEnd(monthAbs - 1);
      const same = ym(monthAbs - 1, td);
      return { from: fmt(ym(monthAbs - 1, 1)), to: fmt(same.getTime() > end.getTime() ? end : same) };
    }
    case "next-month":
      return { from: fmt(ym(monthAbs + 1, 1)), to: fmt(monthEnd(monthAbs + 1)) };
    case "next-3-months":
      return { from: fmt(ym(monthAbs + 1, 1)), to: fmt(monthEnd(monthAbs + 3)) };
    case "last-3-months":
    case "last-6-months":
    case "last-12-months":
    case "last-18-months":
    case "last-24-months":
    case "last-n-months": {
      const m = key === "last-n-months" ? count : Number(key.split("-")[1]);
      return { from: fmt(ym(monthAbs - m, 1)), to: fmt(monthEnd(monthAbs - 1)) };
    }

    // ---- quarter (calendar)
    case "this-quarter":
      return { from: fmt(ym(qStartAbs, 1)), to: fmt(monthEnd(qStartAbs + 2)) };
    case "this-quarter-to-date":
      return { from: fmt(ym(qStartAbs, 1)), to: TODAY };
    case "last-quarter":
      return { from: fmt(ym(qStartAbs - 3, 1)), to: fmt(monthEnd(qStartAbs - 1)) };
    case "last-quarter-to-date":
      return {
        from: fmt(ym(qStartAbs - 3, 1)),
        to: fmt(toDate(ym(qStartAbs - 3, 1), ym(qStartAbs, 1), monthEnd(qStartAbs - 1))),
      };
    case "next-quarter":
      return { from: fmt(ym(qStartAbs + 3, 1)), to: fmt(monthEnd(qStartAbs + 5)) };
    case "next-4-quarters":
      return { from: fmt(ym(qStartAbs + 3, 1)), to: fmt(monthEnd(qStartAbs + 14)) };
    case "last-4-quarters":
      return { from: fmt(ym(qStartAbs - 12, 1)), to: fmt(monthEnd(qStartAbs - 1)) };
    case "last-n-quarters":
      return { from: fmt(ym(qStartAbs - 3 * count, 1)), to: fmt(monthEnd(qStartAbs - 1)) };

    // ---- year (calendar) + tax aliases
    case "this-year":
    case "current-tax-year":
      return { from: fmt(ym(ty * 12, 1)), to: fmt(monthEnd(ty * 12 + 11)) };
    case "this-year-to-date":
    case "current-tax-year-to-date":
      return { from: fmt(ym(ty * 12, 1)), to: TODAY };
    case "last-year":
    case "prior-tax-year":
      return { from: fmt(ym((ty - 1) * 12, 1)), to: fmt(monthEnd((ty - 1) * 12 + 11)) };
    case "last-year-to-date":
    case "prior-tax-year-to-date":
      return {
        from: fmt(ym((ty - 1) * 12, 1)),
        to: fmt(toDate(ym((ty - 1) * 12, 1), ym(ty * 12, 1), monthEnd((ty - 1) * 12 + 11))),
      };
    case "next-year":
      return { from: fmt(ym((ty + 1) * 12, 1)), to: fmt(monthEnd((ty + 1) * 12 + 11)) };
    case "last-2-years":
    case "last-3-years":
    case "last-5-years":
    case "last-10-years":
    case "last-n-years": {
      const yrs = key === "last-n-years" ? count : Number(key.split("-")[1]);
      return { from: fmt(ym((ty - yrs) * 12, 1)), to: fmt(monthEnd((ty - 1) * 12 + 11)) };
    }
    case "current-tax-quarter":
      return { from: fmt(ym(qStartAbs, 1)), to: fmt(monthEnd(qStartAbs + 2)) };
    case "prior-tax-quarter":
      return { from: fmt(ym(qStartAbs - 3, 1)), to: fmt(monthEnd(qStartAbs - 1)) };

    // ---- fiscal year (driven by fiscalStartMonth)
    case "this-fiscal-year":
      return { from: fmt(ym(fyStartAbs, 1)), to: fmt(monthEnd(fyStartAbs + 11)) };
    case "this-fiscal-year-to-date":
      return { from: fmt(ym(fyStartAbs, 1)), to: TODAY };
    case "last-fiscal-year":
      return { from: fmt(ym(fyStartAbs - 12, 1)), to: fmt(monthEnd(fyStartAbs - 1)) };
    case "last-fiscal-year-to-date":
      return {
        from: fmt(ym(fyStartAbs - 12, 1)),
        to: fmt(toDate(ym(fyStartAbs - 12, 1), ym(fyStartAbs, 1), monthEnd(fyStartAbs - 1))),
      };
    case "next-fiscal-year":
      return { from: fmt(ym(fyStartAbs + 12, 1)), to: fmt(monthEnd(fyStartAbs + 23)) };

    default:
      return null; // unknown key → treat as custom
  }
}

/**
 * Server-side: turn a submitted (period, from, to, n) into the effective ISO
 * range. A named period wins (recomputed authoritatively); custom/unknown
 * falls back to the explicit from/to.
 */
export function resolvePeriod(
  period: string | undefined,
  explicitFrom: string | undefined,
  explicitTo: string | undefined,
  todayIso: string,
  fiscalStartMonth: number,
  n?: number
): { from?: string; to?: string; period: string; n: number } {
  const count = n && n > 0 ? Math.floor(n) : 30;
  if (period && period !== "custom") {
    const r = periodRange(period, todayIso, fiscalStartMonth, count);
    if (r) return { from: r.from, to: r.to, period, n: count };
  }
  return {
    from: explicitFrom || undefined,
    to: explicitTo || undefined,
    period: period || "custom",
    n: count,
  };
}
