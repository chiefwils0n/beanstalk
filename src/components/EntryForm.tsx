"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEntry, updateEntry } from "../lib/actions";
import { parseMoney, formatMoney } from "../lib/money";
import { DOCUMENT_CATEGORIES } from "../lib/types";

export type AccountOption = { id: string; label: string; type: string };
export type TagOption = { id: string; name: string; color: string };
export type ClassOption = { id: string; name: string };
export type ContactOption = { id: string; name: string; typeName: string | null; depth: number };
export type LineState = {
  accountId: string;
  classId: string;
  contactId: string;
  description: string;
  debit: string;
  credit: string;
};

const emptyLine = (): LineState => ({
  accountId: "",
  classId: "",
  contactId: "",
  description: "",
  debit: "",
  credit: "",
});

export function ContactSelect({
  contacts,
  value,
  onChange,
}: {
  contacts: ContactOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  // Group by type, preserving the tree order within each group.
  const groups = new Map<string, ContactOption[]>();
  for (const contact of contacts) {
    const key = contact.typeName ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), contact]);
  }
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— no name —</option>
      {[...groups.entries()].map(([typeName, list]) => (
        <optgroup key={typeName} label={typeName}>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {" ".repeat(c.depth * 2)}
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

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
  classes,
  contacts,
  defaultDate,
  entryId,
  initial,
}: {
  accounts: AccountOption[];
  tags: TagOption[];
  classes: ClassOption[];
  contacts: ContactOption[];
  defaultDate: string;
  entryId?: string;
  initial?: { date: string; memo: string; reference: string; tagIds: string[]; lines: LineState[] };
}) {
  const hasClasses = classes.length > 0;
  const hasContacts = contacts.length > 0;
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
  // Files to attach on save, plus their category. `createdId` remembers a
  // just-created entry so a re-save (e.g. after an upload hiccup) updates it
  // instead of posting a duplicate.
  const [files, setFiles] = useState<File[]>([]);
  const [docCategory, setDocCategory] = useState<string>("RECEIPT");
  const [createdId, setCreatedId] = useState<string | null>(null);

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
        classId: l.classId || undefined,
        contactId: l.contactId || undefined,
        description: l.description || undefined,
        debit: safeCents(l.debit) || 0,
        credit: safeCents(l.credit) || 0,
      })),
    };
    startTransition(async () => {
      const existingId = entryId ?? createdId;
      const result: { error?: string; id?: string } = existingId
        ? await updateEntry(existingId, payload)
        : await createEntry(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      const targetId: string | undefined = existingId ?? result.id;
      if (!entryId && !createdId && targetId) setCreatedId(targetId);

      const hadFiles = files.length > 0;
      if (hadFiles && targetId) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fd = new FormData();
          fd.set("file", file);
          fd.set("category", docCategory);
          fd.set("entryId", targetId);
          const res = await fetch("/api/documents", { method: "POST", body: fd });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            // Entry is saved; keep the unsent files so a re-save retries just those.
            setFiles(files.slice(i));
            setError(`Entry saved, but "${file.name}" didn't upload (${body.error || res.status}). Re-save to retry.`);
            return;
          }
        }
        setFiles([]);
      }
      // Land on the entry's detail page when files were attached so they're visible.
      router.push(hadFiles && targetId ? `/transactions/${targetId}` : "/transactions");
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
            <th className="th w-[26%]">Account</th>
            <th className="th">Description</th>
            {hasContacts && <th className="th w-[16%]">Name</th>}
            {hasClasses && <th className="th w-[13%]">Class</th>}
            <th className="th w-36 text-right">Debit</th>
            <th className="th w-36 text-right">Credit</th>
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
              {hasContacts && (
                <td className="td">
                  <ContactSelect
                    contacts={contacts}
                    value={line.contactId}
                    onChange={(contactId) => setLine(i, { contactId })}
                  />
                </td>
              )}
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
            <td className="td font-medium" colSpan={2 + (hasClasses ? 1 : 0) + (hasContacts ? 1 : 0)}>
              <button type="button" className="btn btn-sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                + Add line
              </button>
            </td>
            <td className="td text-right money text-sm font-semibold">{formatMoney(totalDebit)}</td>
            <td className="td text-right money text-sm font-semibold">{formatMoney(totalCredit)}</td>
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

      <div>
        <label className="label">Attachments (optional)</label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            multiple
            className="input max-w-xs"
            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          />
          <select
            className="input w-44"
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value)}
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        {files.length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            {files.length} file{files.length > 1 ? "s" : ""} ready: {files.map((f) => f.name).join(", ")}
          </p>
        )}
      </div>

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
