"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBill, updateBill } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";

type ItemState = { accountId: string; classId: string; description: string; amount: string };

const emptyItem = (): ItemState => ({ accountId: "", classId: "", description: "", amount: "" });

function cents(value: string): number {
  try {
    return parseMoney(value);
  } catch {
    return 0;
  }
}

export function BillForm({
  vendors,
  accounts,
  classes,
  defaultBillDate,
  defaultDueDate,
  edit,
}: {
  vendors: { id: string; name: string }[];
  accounts: { id: string; label: string }[];
  classes: { id: string; name: string }[];
  defaultBillDate: string;
  defaultDueDate: string;
  /** Editing an existing bill: its id, vendor name and current values. */
  edit?: { billId: string; vendorName: string; number: string; notes: string; items: ItemState[] };
}) {
  const hasClasses = classes.length > 0;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [newVendorName, setNewVendorName] = useState("");
  const [number, setNumber] = useState(edit?.number ?? "");
  const [billDate, setBillDate] = useState(defaultBillDate);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [items, setItems] = useState<ItemState[]>(edit?.items.length ? edit.items : [emptyItem()]);

  const setItem = (i: number, patch: Partial<ItemState>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const total = items.reduce((s, it) => s + cents(it.amount), 0);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const payload = {
        vendorId: vendorId || undefined,
        newVendorName: vendorId ? undefined : newVendorName,
        number,
        billDate,
        dueDate,
        notes,
        items: items.map((it) => ({
          accountId: it.accountId,
          classId: it.classId || undefined,
          description: it.description,
          amount: cents(it.amount),
        })),
      };
      const result = edit ? await updateBill(edit.billId, payload) : await createBill(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/bills/${result.id}`);
      router.refresh();
    });
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Vendor</label>
          {edit ? (
            <p className="input bg-zinc-50 text-zinc-500 dark:bg-zinc-900">{edit.vendorName}</p>
          ) : (
            <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value="">+ New vendor…</option>
            </select>
          )}
          {!edit && !vendorId && (
            <input
              className="input mt-2"
              placeholder="New vendor name"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Bill no.</label>
            <input className="input" placeholder="optional" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">Bill date</label>
            <input type="date" className="input" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
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
            <th className="th w-1/3">Account</th>
            {hasClasses && <th className="th w-36">Class</th>}
            <th className="th w-32 text-right">Amount</th>
            <th className="th w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className="td">
                <input
                  className="input"
                  placeholder="What the bill is for"
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
              </td>
              <td className="td">
                <select
                  className="input"
                  aria-label="Account"
                  value={item.accountId}
                  onChange={(e) => setItem(i, { accountId: e.target.value })}
                >
                  <option value="">— select —</option>
                  {accounts.map((a) => (
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
                    aria-label="Class"
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
                  placeholder="0.00"
                  aria-label="Amount"
                  value={item.amount}
                  onChange={(e) => setItem(i, { amount: e.target.value })}
                />
              </td>
              <td className="td text-right">
                {items.length > 1 && (
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-red-500"
                    aria-label="Remove line"
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
            <td className="td" colSpan={hasClasses ? 2 : 1}>
              <button type="button" className="btn btn-sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
                + Add line
              </button>
            </td>
            <td className="td text-right text-sm font-semibold">Total</td>
            <td className="td text-right money text-sm font-semibold">{formatMoney(total)}</td>
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
          {pending ? "Saving…" : edit ? "Save changes" : "Save bill"}
        </button>
        <span className="text-sm text-zinc-500">
          {edit
            ? "Rewrites this bill's ledger entry. Payments already recorded are not changed."
            : "Posts the expense to Accounts Payable on the bill date."}
        </span>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
