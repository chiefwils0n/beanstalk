"use client";

import { useState } from "react";
import { periodRange } from "../lib/periods";

// Each preset fills the single "as of" date with the END of that period.
const PRESETS: { key: string; label: string }[] = [
  { key: "custom", label: "Custom date" },
  { key: "today", label: "Today" },
  { key: "this-month", label: "End of this month" },
  { key: "last-month", label: "End of last month" },
  { key: "this-quarter", label: "End of this quarter" },
  { key: "last-quarter", label: "End of last quarter" },
  { key: "this-year", label: "End of this year" },
  { key: "this-fiscal-year", label: "End of this fiscal year" },
  { key: "last-fiscal-year", label: "End of last fiscal year" },
];

export function AsOfField({
  today,
  fiscalStartMonth,
  defaultAsOf,
}: {
  today: string;
  fiscalStartMonth: number;
  defaultAsOf: string;
}) {
  const [date, setDate] = useState(defaultAsOf);
  const [preset, setPreset] = useState("custom");

  function onPreset(key: string) {
    setPreset(key);
    if (key === "custom") return;
    if (key === "today") {
      setDate(today);
      return;
    }
    const range = periodRange(key, today, fiscalStartMonth);
    if (range?.to) setDate(range.to);
  }

  return (
    <>
      <div>
        <label className="label">As of preset</label>
        <select value={preset} onChange={(e) => onPreset(e.target.value)} className="input">
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">As of</label>
        <input
          type="date"
          name="asOf"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPreset("custom");
          }}
          className="input"
        />
      </div>
    </>
  );
}
