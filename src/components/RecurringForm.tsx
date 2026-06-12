"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecurring } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "../lib/types";
import type { AccountOption, ClassOption, LineState } from "./EntryForm";

const emptyLine = (): LineState => ({
  accountId: "",
  classId: "",
  description: "",
  debit: "",
  credit: "",
});

function safeCents(value: string): number {
  try {
    return parseMoney(value);
  } catch {
    return NaN;
  }
}

export function RecurringForm({
  accounts,
  classes,
  defaultDate,
}: {
  accounts: AccountOption[];
  classes: ClassOption[];
  defaultDate: string;
}) {
  const hasClasses = classes.length > 0;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [interval, setInterval] = useState("1");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState("");
  const [autoPost, setAutoPost] = useState(true);
  const [lines, setLines] = useState<LineState[]>([emptyLine(), emptyLine()]);

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalDebit = lines.reduce((s, l) => s + (safeCents(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (safeCents(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createRecurring({
        name,
        memo,
        frequency,
        interval: Number(interval || 1),
        startDate,
        endDate: endDate || undefined,
        autoPost,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          classId: l.classId || undefined,
          description: l.description || undefined,
          debit: safeCents(l.debit) || 0,
          credit: safeCents(l.credit) || 0,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/recurring");
      router.refresh();
    });
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="Office rent, software subscription…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Memo (used on posted entries)</label>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Repeat every</label>
          <div className="flex gap-2">
            <input
              className="input w-16"
              inputMode="numeric"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
            <select
              className="input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">First run</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">End date (optional)</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
            Post automatically when due
          </label>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr>
            <th className="th w-2/5">Account</th>
            <th className="th">Description</th>
            {hasClasses && <th className="th w-36">Class</th>}
            <th className="th w-28 text-right">Debit</th>
            <th className="th w-28 text-right">Credit</th>
            <th className="th w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="td">
                <select
                  className="input"
                  value={line.accountId}
                  onChange={(e) => setLine(i, { accountId: e.target.value })}
                >
                  <option value="">— select account —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="td">
                <input
                  className="input"
                  value={line.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
              </td>
              {hasClasses && (
                <td className="td">
                  <select
                    className="input"
                    value={line.classId}
                    onChange={(e) => setLine(i, { classId: e.target.value })}
                  >
                    <option value="">— no class —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
              )}
              <td className="td">
                <input
                  className="input text-right"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.debit}
                  onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })}
                />
              </td>
              <td className="td">
                <input
                  className="input text-right"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={line.credit}
                  onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })}
                />
              </td>
              <td className="td text-right">
                {lines.length > 2 && (
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="td" colSpan={hasClasses ? 3 : 2}>
              <button type="button" className="btn btn-sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                + Add line
              </button>
            </td>
            <td className="td text-right font-mono text-sm font-semibold">{formatMoney(totalDebit)}</td>
            <td className="td text-right font-mono text-sm font-semibold">{formatMoney(totalCredit)}</td>
            <td className="td" />
          </tr>
        </tfoot>
      </table>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending || !balanced} onClick={submit}>
          {pending ? "Saving…" : "Create recurring transaction"}
        </button>
        {!balanced && totalDebit + totalCredit > 0 && (
          <span className="text-sm text-amber-600 dark:text-amber-400">
            Out of balance by {formatMoney(Math.abs(totalDebit - totalCredit))}
          </span>
        )}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
