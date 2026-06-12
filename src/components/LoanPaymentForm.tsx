"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordLoanPayment } from "../lib/actions";
import { formatMoney, parseMoney } from "../lib/money";
import { nextPaymentSplit } from "../lib/loans";

export function LoanPaymentForm({
  loanId,
  balance,
  annualRate,
  payment,
  defaultDate,
}: {
  loanId: string;
  balance: number;
  annualRate: number;
  payment: number;
  defaultDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [extra, setExtra] = useState("");
  const [principalOnly, setPrincipalOnly] = useState(false);

  let extraCents = 0;
  try {
    extraCents = extra ? parseMoney(extra) : 0;
  } catch {
    extraCents = NaN;
  }
  const split = nextPaymentSplit(balance, annualRate, payment);
  const previewPrincipal = principalOnly
    ? Math.min(extraCents || 0, balance)
    : split.principal + Math.min(extraCents || 0, balance - split.principal);
  const previewInterest = principalOnly ? 0 : split.interest;
  const previewTotal = previewPrincipal + previewInterest;

  const submit = () => {
    setError(null);
    if (Number.isNaN(extraCents)) {
      setError("Invalid extra amount");
      return;
    }
    startTransition(async () => {
      const result = await recordLoanPayment(loanId, {
        date,
        extra: extraCents,
        principalOnly,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Payment date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">{principalOnly ? "Principal amount" : "Extra principal (optional)"}</label>
          <input
            className="input w-32 text-right"
            inputMode="decimal"
            placeholder="0.00"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={principalOnly}
            onChange={(e) => setPrincipalOnly(e.target.checked)}
          />
          Principal-only payment
        </label>
        <button className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Posting…" : "Record payment"}
        </button>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Will post: <span className="font-mono">{formatMoney(previewPrincipal)}</span> principal
        {previewInterest > 0 && (
          <>
            {" + "}
            <span className="font-mono">{formatMoney(previewInterest)}</span> interest
          </>
        )}
        {" = "}
        <span className="font-mono font-semibold">{formatMoney(previewTotal)}</span> from your
        payment account.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
