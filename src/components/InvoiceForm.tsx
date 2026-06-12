"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";

type ItemState = {
  accountId: string;
  classId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const emptyItem = (): ItemState => ({
  accountId: "",
  classId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
});

function cents(value: string): number {
  try {
    return parseMoney(value);
  } catch {
    return 0;
  }
}

export function InvoiceForm({
  customers,
  incomeAccounts,
  classes,
  defaultIssueDate,
  defaultDueDate,
}: {
  customers: { id: string; name: string }[];
  incomeAccounts: { id: string; label: string }[];
  classes: { id: string; name: string }[];
  defaultIssueDate: string;
  defaultDueDate: string;
}) {
  const hasClasses = classes.length > 0;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [issueDate, setIssueDate] = useState(defaultIssueDate);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemState[]>([emptyItem()]);

  const setItem = (i: number, patch: Partial<ItemState>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const total = items.reduce((s, it) => s + Math.round(Number(it.quantity || 0) * cents(it.unitPrice)), 0);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({
        customerId: customerId || undefined,
        newCustomerName: customerId ? undefined : newCustomerName,
        issueDate,
        dueDate,
        notes,
        items: items.map((it) => ({
          accountId: it.accountId,
          classId: it.classId || undefined,
          description: it.description,
          quantity: Number(it.quantity || 0),
          unitPrice: cents(it.unitPrice),
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/invoices/${result.id}`);
      router.refresh();
    });
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">+ New customer…</option>
          </select>
          {!customerId && (
            <input
              className="input mt-2"
              placeholder="New customer name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Issue date</label>
            <input type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Description</th>
            <th className="th w-1/4">Income account</th>
            {hasClasses && <th className="th w-32">Class</th>}
            <th className="th w-20 text-right">Qty</th>
            <th className="th w-28 text-right">Unit price</th>
            <th className="th w-28 text-right">Amount</th>
            <th className="th w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className="td">
                <input
                  className="input"
                  placeholder="Service or product"
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
              </td>
              <td className="td">
                <select
                  className="input"
                  value={item.accountId}
                  onChange={(e) => setItem(i, { accountId: e.target.value })}
                >
                  <option value="">— select —</option>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </td>
              {hasClasses && (
                <td className="td">
                  <select
                    className="input"
                    value={item.classId}
                    onChange={(e) => setItem(i, { classId: e.target.value })}
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
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                />
              </td>
              <td className="td">
                <input
                  className="input text-right"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={item.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                />
              </td>
              <td className="td text-right font-mono text-sm">
                {formatMoney(Math.round(Number(item.quantity || 0) * cents(item.unitPrice)))}
              </td>
              <td className="td text-right">
                {items.length > 1 && (
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
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
            <td className="td" colSpan={hasClasses ? 4 : 3}>
              <button type="button" className="btn btn-sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
                + Add item
              </button>
            </td>
            <td className="td text-right text-sm font-semibold">Total</td>
            <td className="td text-right font-mono text-sm font-semibold">{formatMoney(total)}</td>
            <td className="td" />
          </tr>
        </tfoot>
      </table>

      <div>
        <label className="label">Notes (optional)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Creating…" : "Create draft invoice"}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
