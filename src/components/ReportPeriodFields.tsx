"use client";

import { useState } from "react";
import { PERIOD_OPTIONS, periodRange, type PeriodKey } from "../lib/periods";

/**
 * Period preset + From/To date inputs for report filter forms. Picking a preset
 * fills the dates instantly (using the server-provided `today` so client/server
 * agree); editing a date switches the preset to "Custom". Submits `period`,
 * `from`, and `to` — the server recomputes named periods authoritatively.
 */
export function ReportPeriodFields({
  today,
  fiscalStartMonth,
  defaultPeriod = "custom",
  defaultFrom = "",
  defaultTo = "",
}: {
  today: string;
  fiscalStartMonth: number;
  defaultPeriod?: string;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const [period, setPeriod] = useState<PeriodKey>(defaultPeriod as PeriodKey);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  function onPeriod(value: string) {
    const key = value as PeriodKey;
    setPeriod(key);
    if (key === "custom") return; // leave the dates for manual editing
    const range = periodRange(key, today, fiscalStartMonth);
    if (!range) return;
    setFrom(range.from ?? "");
    setTo(range.to ?? "");
  }

  return (
    <>
      <div>
        <label className="label">Period</label>
        <select
          name="period"
          value={period}
          onChange={(e) => onPeriod(e.target.value)}
          className="input"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">From</label>
        <input
          type="date"
          name="from"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPeriod("custom");
          }}
          className="input"
        />
      </div>
      <div>
        <label className="label">To</label>
        <input
          type="date"
          name="to"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPeriod("custom");
          }}
          className="input"
        />
      </div>
    </>
  );
}
