"use client";

import { useState } from "react";
import { formatMoney, parseMoney } from "../lib/money";
import { projectSchedule, totalInterest, standardPayment, nextPaymentSplit } from "../lib/loans";

export function LoanWhatIf({
  balance,
  annualRate,
  payment,
  nextDateISO,
  remainingInterest,
  remainingMonths,
  paymentsMade,
  termMonths,
}: {
  balance: number;
  annualRate: number;
  payment: number;
  nextDateISO: string;
  remainingInterest: number;
  remainingMonths: number;
  paymentsMade: number;
  termMonths: number;
}) {
  const [extra, setExtra] = useState("");
  let extraCents = 0;
  try {
    extraCents = extra ? parseMoney(extra) : 0;
  } catch {
    extraCents = NaN;
  }
  const valid = !Number.isNaN(extraCents) && extraCents > 0 && extraCents < balance;

  let keep = null;
  let recast = null;
  if (valid) {
    const newBalance = balance - extraCents;
    const schedule = projectSchedule({
      balance: newBalance,
      annualRatePct: annualRate,
      payment,
      startDate: new Date(nextDateISO),
    });
    const split = nextPaymentSplit(newBalance, annualRate, payment);
    keep = {
      months: schedule.length,
      monthsSaved: remainingMonths - schedule.length,
      interest: totalInterest(schedule),
      interestSaved: remainingInterest - totalInterest(schedule),
      payoff: schedule.length ? schedule[schedule.length - 1].date : null,
      split,
    };
    const termLeft = Math.max(termMonths - paymentsMade, 1);
    const newPayment = standardPayment(newBalance, annualRate, termLeft);
    recast = {
      payment: newPayment,
      split: nextPaymentSplit(newBalance, annualRate, newPayment),
      termLeft,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">If I put this much toward principal today…</label>
          <input
            className="input w-40 text-right"
            inputMode="decimal"
            placeholder="e.g. 5,000.00"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
      </div>
      {valid && keep && recast && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold">Keep the same payment ({formatMoney(payment)}/mo)</p>
            <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
              <li>
                Paid off{" "}
                <span className="font-medium">
                  {keep.monthsSaved > 0 ? `${keep.monthsSaved} months sooner` : "on schedule"}
                </span>
                {keep.payoff &&
                  ` (${keep.payoff.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" })})`}
              </li>
              <li>
                Interest saved:{" "}
                <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
                  {formatMoney(Math.max(keep.interestSaved, 0))}
                </span>
              </li>
              <li>
                Next payment split: {formatMoney(keep.split.principal)} principal /{" "}
                {formatMoney(keep.split.interest)} interest
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-700">
            <p className="font-semibold">Recast: keep the original term ({recast.termLeft} months left)</p>
            <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
              <li>
                New monthly payment:{" "}
                <span className="font-mono font-medium">{formatMoney(recast.payment)}</span>{" "}
                <span className="text-zinc-400">
                  (was {formatMoney(payment)}, −{formatMoney(Math.max(payment - recast.payment, 0))}/mo)
                </span>
              </li>
              <li>
                New P&amp;I split: {formatMoney(recast.split.principal)} principal /{" "}
                {formatMoney(recast.split.interest)} interest
              </li>
            </ul>
          </div>
        </div>
      )}
      {extra && !valid && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Enter an amount between $0 and the current balance.
        </p>
      )}
    </div>
  );
}
