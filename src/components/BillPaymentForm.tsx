"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordBillPayment } from "../lib/actions";
import { parseMoney } from "../lib/money";

export function BillPaymentForm({
  billId,
  accounts,
  defaultDate,
  defaultAmount,
}: {
  billId: string;
  accounts: { id: string; label: string }[];
  defaultDate: string;
  defaultAmount: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(defaultAmount);

  const submit = () => {
    setError(null);
    let cents: number;
    try {
      cents = parseMoney(amount);
    } catch {
      setError("Invalid amount");
      return;
    }
    startTransition(async () => {
      const result = await recordBillPayment(billId, { date, accountId, amount: cents });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Payment date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label">Pay from</label>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Amount</label>
        <input
          className="input w-28 text-right"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <button className="btn btn-primary" disabled={pending || !accountId} onClick={submit}>
        {pending ? "Recording…" : "Record payment"}
      </button>
      {error && <span className="pb-2 text-sm text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
