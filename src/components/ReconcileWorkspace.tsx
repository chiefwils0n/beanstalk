"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReconcileProgress, finishReconciliation } from "../lib/actions";
import { formatMoney } from "../lib/money";

type WorkLine = { id: string; date: string; memo: string; amount: number; cleared: boolean };

export function ReconcileWorkspace({
  account,
  statementDate,
  endingBalance,
  beginning,
  lines,
}: {
  account: { id: string; name: string; type: string };
  statementDate: string;
  endingBalance: number;
  beginning: number;
  lines: WorkLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(
    new Set(lines.filter((l) => l.cleared).map((l) => l.id))
  );

  const clearedSum = lines.reduce((s, l) => s + (checked.has(l.id) ? l.amount : 0), 0);
  const difference = endingBalance - (beginning + clearedSum);
  const allChecked = checked.size === lines.length && lines.length > 0;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = () => ({
    clearedLineIds: lines.filter((l) => checked.has(l.id)).map((l) => l.id),
    unclearedLineIds: lines.filter((l) => !checked.has(l.id)).map((l) => l.id),
  });

  const save = () =>
    startTransition(async () => {
      setError(null);
      await saveReconcileProgress(ids().clearedLineIds, ids().unclearedLineIds);
      router.refresh();
    });

  const finish = () =>
    startTransition(async () => {
      setError(null);
      const result = await finishReconciliation({
        accountId: account.id,
        statementDate,
        endingBalance,
        ...ids(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.push("/reconcile");
      router.refresh();
    });

  if (done) return <div className="card text-emerald-600 dark:text-emerald-400">✓ Reconciled!</div>;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">{account.name} — statement through {statementDate}</h2>
        <div className="flex gap-5 font-mono text-sm">
          <span>Beginning {formatMoney(beginning)}</span>
          <span>Cleared {formatMoney(clearedSum)}</span>
          <span>Statement {formatMoney(endingBalance)}</span>
          <span
            className={
              difference === 0
                ? "font-bold text-emerald-600 dark:text-emerald-400"
                : "font-bold text-amber-600 dark:text-amber-400"
            }
          >
            Difference {formatMoney(difference)}
          </span>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900">
            <tr>
              <th className="th w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() =>
                    setChecked(allChecked ? new Set() : new Set(lines.map((l) => l.id)))
                  }
                />
              </th>
              <th className="th">Date</th>
              <th className="th">Memo</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={4}>
                  Nothing to reconcile through this date.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr
                key={line.id}
                className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                onClick={() => toggle(line.id)}
              >
                <td className="td">
                  <input type="checkbox" checked={checked.has(line.id)} readOnly />
                </td>
                <td className="td whitespace-nowrap text-zinc-500">{line.date}</td>
                <td className="td">{line.memo}</td>
                <td className={`td text-right font-mono ${line.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {formatMoney(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending} onClick={save}>
          Save progress
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || difference !== 0 || checked.size === 0}
          onClick={finish}
          title={difference !== 0 ? "Difference must be zero to finish" : ""}
        >
          {pending ? "Working…" : "Finish reconciliation"}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
