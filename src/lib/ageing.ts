/**
 * Ageing of open receivables / payables, as pure functions. An open document
 * (invoice or bill) falls in a bucket by how many days past its due date it is
 * on the "as of" date. Amounts are integer cents; dates are UTC calendar dates.
 */

export const AGEING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90plus"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_LABELS: Record<AgeingBucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90plus: "Over 90 days",
};

const DAY = 86400000;

/** Whole days past due on `asOf` (0 or negative = not yet due). */
export function daysPastDue(dueDate: Date, asOf: Date): number {
  return Math.round((asOf.getTime() - dueDate.getTime()) / DAY);
}

export function ageingBucket(dueDate: Date, asOf: Date): AgeingBucket {
  const days = daysPastDue(dueDate, asOf);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

export type OpenDoc = {
  id: string;
  label: string;
  contactId: string;
  contactName: string;
  date: Date;
  dueDate: Date;
  /** Unpaid balance on the as-of date, cents. */
  open: number;
};

export type AgedDoc = OpenDoc & { bucket: AgeingBucket; daysPastDue: number };
export type BucketTotals = Record<AgeingBucket, number>;
export type AgeingGroup = {
  contactId: string;
  contactName: string;
  docs: AgedDoc[];
  totals: BucketTotals;
  total: number;
};

const emptyTotals = (): BucketTotals => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 });

/**
 * Group open documents by contact with per-bucket totals. Documents with
 * nothing left to pay are dropped. Contacts sort by name, documents by due date.
 */
export function buildAgeing(docs: OpenDoc[], asOf: Date) {
  const groups = new Map<string, AgeingGroup>();
  const totals = emptyTotals();
  let total = 0;
  for (const doc of docs) {
    if (doc.open <= 0) continue;
    const bucket = ageingBucket(doc.dueDate, asOf);
    let group = groups.get(doc.contactId);
    if (!group) {
      group = { contactId: doc.contactId, contactName: doc.contactName, docs: [], totals: emptyTotals(), total: 0 };
      groups.set(doc.contactId, group);
    }
    group.docs.push({ ...doc, bucket, daysPastDue: Math.max(0, daysPastDue(doc.dueDate, asOf)) });
    group.totals[bucket] += doc.open;
    group.total += doc.open;
    totals[bucket] += doc.open;
    total += doc.open;
  }
  const sorted = [...groups.values()].sort((a, b) => a.contactName.localeCompare(b.contactName));
  for (const group of sorted) group.docs.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return { groups: sorted, totals, total };
}
