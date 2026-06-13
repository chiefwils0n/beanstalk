"use client";

import { useState } from "react";
import { PERIOD_GROUPS, NEEDS_N, periodRange } from "../lib/periods";

/**
 * Period preset + From/To date inputs for report filter forms. Picking a preset
 * fills the dates instantly (using the server-provided `today` so client/server
 * agree); LAST_N_* presets reveal a count input; editing a date switches to
 * "Custom". Submits `period`, `n`, `from`, `to` — the server recomputes named
 * periods authoritatively.
 */
export function ReportPeriodFields({
  today,
  fiscalStartMonth,
  defaultPeriod = "custom",
  defaultFrom = "",
  defaultTo = "",
  defaultN = 30,
}: {
  today: string;
  fiscalStartMonth: number;
  defaultPeriod?: string;
  defaultFrom?: string;
  defaultTo?: string;
  defaultN?: number;
}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [n, setN] = useState(defaultN);

  function fill(key: string, count: number) {
    if (key === "custom") return; // leave dates for manual editing
    const range = periodRange(key, today, fiscalStartMonth, count);
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
          onChange={(e) => {
            setPeriod(e.target.value);
            fill(e.target.value, n);
          }}
          className="input"
        >
          {PERIOD_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {NEEDS_N.has(period) && (
        <div>
          <label className="label">N</label>
          <input
            type="number"
            name="n"
            min={1}
            value={n}
            onChange={(e) => {
              const count = Number(e.target.value) || 1;
              setN(count);
              fill(period, count);
            }}
            className="input w-20"
          />
        </div>
      )}
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
