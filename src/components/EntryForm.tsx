"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEntry, updateEntry } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";

export type AccountOption = { id: string; label: string; type: string };
export type TagOption = { id: string; name: string; color: string };
export type LineState = { accountId: string; description: string; debit: string; credit: string };

const emptyLine = (): LineState => ({ accountId: "", description: "", debit: "", credit: "" });

function safeCents(value: string): number {
  try {
    return parseMoney(value);
  } catch {
    return NaN;
  }
}

export function EntryForm({
  accounts,
  tags,
  defaultDate,
  entryId,
  initial,
}: {
  accounts: AccountOption[];
  tags: TagOption[];
  defaultDate: string;
  entryId?: string;
  initial?: { date: string; memo: string; reference: string; tagIds: string[]; lines: LineState[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [lines, setLines] = useState<LineState[]>(
    initial?.lines?.length ? initial.lines : [emptyLine(), emptyLine()]
  );

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalDebit = lines.reduce((s, l) => s + (safeCents(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (safeCents(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const submit = () => {
    setError(null);
    const payload = {
      date,
      memo,
      reference,
      tagIds,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        description: l.description || undefined,
        debit: safeCents(l.debit) || 0,
        credit: safeCents(l.credit) || 0,
      })),
    };
    startTransition(async () => {
      const result = entryId ? await updateEntry(entryId, payload) : await createEntry(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/transactions");
      router.refresh();
    });
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Memo</label>
          <input
            className="input"
            value={memo}
            placeholder="What is this for?"
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Reference (optional)</label>
          <input
            className="input"
            value={reference}
            placeholder="Check #, invoice #…"
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr>
            <th className="th w-2/5">Account</th>
            <th className="th">Description</th>
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
            <td className="td font-medium" colSpan={2}>
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

      {tags.length > 0 && (
        <div>
          <label className="label">Tags</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setTagIds((prev) =>
                      selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    )
                  }
                  className={`badge border ${
                    selected
                      ? "border-transparent text-white"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                  style={selected ? { backgroundColor: tag.color } : undefined}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending || !balanced} onClick={submit}>
          {pending ? "Saving…" : entryId ? "Save changes" : "Post entry"}
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
