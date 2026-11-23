/**
 * Cash paid to each contact, as a pure function — the basis for year-end 1099
 * totals. Only money that actually left a cash/bank account counts: an unpaid
 * bill is not a payment, and neither is anything paid by credit card (card
 * payments are reported by the card processor, not by you).
 *
 * For each entry that takes cash out, every non-cash line that names a contact
 * is attributed to that contact (debits less credits), capped at the cash that
 * left. Amounts are integer cents.
 */

export type PaymentLine = { accountId: string; contactId: string | null; debit: number; credit: number };
export type PaymentEntry = { lines: PaymentLine[] };

export function contactPayments(entries: PaymentEntry[], cashIds: Set<string>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const cashOut = entry.lines
      .filter((l) => cashIds.has(l.accountId))
      .reduce((s, l) => s + l.credit - l.debit, 0);
    if (cashOut <= 0) continue;
    const perContact = new Map<string, number>();
    for (const line of entry.lines) {
      if (!line.contactId || cashIds.has(line.accountId)) continue;
      perContact.set(line.contactId, (perContact.get(line.contactId) ?? 0) + line.debit - line.credit);
    }
    for (const [contactId, amount] of perContact) {
      const paid = Math.min(amount, cashOut);
      if (paid > 0) totals.set(contactId, (totals.get(contactId) ?? 0) + paid);
    }
  }
  return totals;
}

/**
 * The federal 1099-NEC / 1099-MISC reporting threshold for a tax year, cents.
 * $600 through 2025; $2,000 for payments made in 2026 (indexed for inflation
 * after that — confirm the current figure with your tax preparer).
 */
export function default1099Threshold(year: number): number {
  return year >= 2026 ? 200000 : 60000;
}
