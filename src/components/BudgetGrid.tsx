"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBudget } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Row = { id: string; label: string; type: string };

/** Cents for a typed amount; null when it isn't a valid, non-negative amount. */
function cents(value: string): number | null {
  if (!value.trim()) return 0;
  try {
    const n = parseMoney(value);
    return n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function BudgetGrid({
  year,
  accounts,
  initial,
}: {
  year: number;
  accounts: Row[];
  initial: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string[]>>(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const rowOf = (id: string) => values[id] ?? Array(12).fill("");
  const setCell = (id: string, month: number, value: string) => {
    setValues((prev) => ({ ...prev, [id]: rowOf(id).map((v, i) => (i === month ? value : v)) }));
    setDirty(true);
    setNote(null);
  };
  const fillAcross = (id: string) => {
    const first = rowOf(id).find((v) => v.trim()) ?? "";
    setValues((prev) => ({ ...prev, [id]: Array(12).fill(first) }));
    setDirty(true);
    setNote(null);
  };
  const rowTotal = (id: string) => rowOf(id).reduce((s, v) => s + (cents(v) ?? 0), 0);
  const invalid = accounts.some((a) => rowOf(a.id).some((v) => cents(v) === null));

  const save = () => {
    setNote(null);
    const cells = accounts.flatMap((a) =>
      rowOf(a.id).map((v, i) => ({ accountId: a.id, month: i + 1, amount: cents(v) ?? 0 }))
    );
    startTransition(async () => {
      const result = await saveBudget({ year, cells });
      if (result.error) {
        setNote({ ok: false, text: result.error });
        return;
      }
      setDirty(false);
      setNote({ ok: true, text: `Saved the ${year} budget.` });
      router.refresh();
    });
  };

  const section = (type: string, title: string) => {
    const rows = accounts.filter((a) => a.type === type);
    if (rows.length === 0) return null;
    const total = rows.reduce((s, a) => s + rowTotal(a.id), 0);
    return (
      <tbody key={type}>
        <tr>
          <td className="td bg-zinc-50 font-bold dark:bg-zinc-900" colSpan={15}>
            {title}
          </td>
        </tr>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="td whitespace-pre text-sm">{a.label}</td>
            {rowOf(a.id).map((v, i) => (
              <td key={i} className="px-0.5 py-1">
                <input
                  className={`input w-20 px-1.5 text-right text-sm ${cents(v) === null ? "border-red-500" : ""}`}
                  inputMode="decimal"
                  aria-label={`${a.label.trim()} ${MONTHS[i]}`}
                  value={v}
                  onChange={(e) => setCell(a.id, i, e.target.value)}
                />
              </td>
            ))}
            <td className="td whitespace-nowrap text-right money text-sm">{formatMoney(rowTotal(a.id))}</td>
            <td className="td">
              <button
                type="button"
                className="btn btn-sm whitespace-nowrap"
                title="Copy the first amount in this row to every month"
                onClick={() => fillAcross(a.id)}
              >
                Fill year
              </button>
            </td>
          </tr>
        ))}
        <tr className="total-row">
          <td className="td font-semibold" colSpan={13}>
            Total {title.toLowerCase()} budget
          </td>
          <td className="td whitespace-nowrap text-right money font-semibold">{formatMoney(total)}</td>
          <td className="td" />
        </tr>
      </tbody>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Account</th>
              {MONTHS.map((m) => (
                <th key={m} className="th text-right">
                  {m}
                </th>
              ))}
              <th className="th text-right">Year</th>
              <th className="th" />
            </tr>
          </thead>
          {section("INCOME", "Income")}
          {section("EXPENSE", "Expenses")}
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending || invalid || !dirty} onClick={save}>
          {pending ? "Saving…" : `Save ${year} budget`}
        </button>
        {invalid && <span className="text-sm text-red-600 dark:text-red-400">Fix the amounts outlined in red.</span>}
        {note && (
          <span className={`text-sm ${note.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {note.text}
          </span>
        )}
      </div>
    </div>
  );
}
