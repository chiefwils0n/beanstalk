import { formatMoney } from "./money";

// The snapshot shape stored in AuditEvent.detail (plus memo from the row).
export type SnapshotLine = {
  account: string;
  debit: number;
  credit: number;
  class: string | null;
  contact: string | null;
  description: string | null;
};
export type Snapshot = {
  memo: string;
  date: string;
  reference: string | null;
  status: string;
  lines: SnapshotLine[];
};

export type AuditChange =
  | { kind: "field"; label: string; from: string; to: string }
  | { kind: "line-added"; text: string }
  | { kind: "line-removed"; text: string };

type AuditEventLike = {
  id: string;
  entryId: string | null;
  action: string;
  memo: string;
  detail: string | null;
  createdAt: Date;
};

function toSnapshot(event: { memo: string; detail: string | null }): Snapshot | null {
  if (!event.detail) return null;
  try {
    const parsed = JSON.parse(event.detail) as Omit<Snapshot, "memo">;
    return { memo: event.memo, ...parsed };
  } catch {
    return null;
  }
}

function lineKey(l: SnapshotLine): string {
  return JSON.stringify([l.account, l.debit, l.credit, l.class, l.contact, l.description]);
}

function formatLine(l: SnapshotLine): string {
  const amount = l.debit ? `Dr ${formatMoney(l.debit)}` : l.credit ? `Cr ${formatMoney(l.credit)}` : "$0.00";
  const extras = [l.class, l.contact, l.description].filter(Boolean).join(" · ");
  return `${l.account} ${amount}${extras ? ` (${extras})` : ""}`;
}

/** Human-readable list of what changed between two entry snapshots. */
export function diffSnapshots(prev: Snapshot, curr: Snapshot): AuditChange[] {
  const changes: AuditChange[] = [];

  const field = (label: string, from: string | null, to: string | null) => {
    if ((from ?? "") !== (to ?? "")) {
      changes.push({ kind: "field", label, from: from || "—", to: to || "—" });
    }
  };
  field("Memo", prev.memo, curr.memo);
  field("Date", prev.date, curr.date);
  field("Reference", prev.reference, curr.reference);
  field("Status", prev.status, curr.status);

  // Lines are recreated on edit (no stable id), so match identical lines and
  // report the rest as removed/added.
  const used = new Array(curr.lines.length).fill(false);
  for (const pl of prev.lines) {
    const idx = curr.lines.findIndex((cl, i) => !used[i] && lineKey(cl) === lineKey(pl));
    if (idx >= 0) used[idx] = true;
    else changes.push({ kind: "line-removed", text: formatLine(pl) });
  }
  curr.lines.forEach((cl, i) => {
    if (!used[i]) changes.push({ kind: "line-added", text: formatLine(cl) });
  });

  return changes;
}

/**
 * Annotate each event with the changes it introduced. For an UPDATED event we
 * diff against the previous event of the same entry *within the given list*
 * (the per-entry History passes the full chain; the global log passes its
 * window — events whose predecessor isn't loaded simply get no diff).
 */
export function withDiffs<T extends AuditEventLike>(events: T[]): (T & { changes?: AuditChange[] })[] {
  const byEntry = new Map<string, T[]>();
  for (const e of events) {
    if (!e.entryId) continue;
    byEntry.set(e.entryId, [...(byEntry.get(e.entryId) ?? []), e]);
  }
  const changeById = new Map<string, AuditChange[]>();
  for (const list of byEntry.values()) {
    const asc = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let prev: Snapshot | null = null;
    for (const e of asc) {
      const snap = toSnapshot(e);
      if (e.action === "UPDATED" && prev && snap) changeById.set(e.id, diffSnapshots(prev, snap));
      if (snap) prev = snap;
    }
  }
  return events.map((e) => ({ ...e, changes: changeById.get(e.id) }));
}
