"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_CATEGORIES } from "../lib/types";

export function DocumentUpload({
  entries,
  invoices,
}: {
  entries: { id: string; label: string }[];
  invoices: { id: string; label: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">File</label>
        <input type="file" name="file" required className="input" />
      </div>
      <div>
        <label className="label">Category</label>
        <select name="category" className="input">
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Link to transaction (optional)</label>
        <select name="entryId" className="input max-w-56">
          <option value="">—</option>
          {entries.map((e2) => (
            <option key={e2.id} value={e2.id}>
              {e2.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Link to invoice (optional)</label>
        <select name="invoiceId" className="input">
          <option value="">—</option>
          {invoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.label}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {error && <span className="pb-2 text-sm text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}
