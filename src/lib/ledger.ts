/**
 * The core double-entry invariant, as a pure function so it has a single
 * source of truth and can be unit-tested without a database. Every code path
 * that posts to the ledger must run lines through this check.
 *
 * Amounts are integer cents. Returns an error message, or null when the lines
 * form a valid balanced entry.
 */
export type BalanceCheckLine = { debit: number; credit: number };

export function checkBalanced(lines: BalanceCheckLine[]): string | null {
  if (lines.length < 2) return "An entry needs at least two non-zero lines";
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) return "Amounts must be positive";
    if (line.debit > 0 && line.credit > 0)
      return "A line can have a debit or a credit, not both";
  }
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit)
    return `Entry is out of balance: debits ${totalDebit} ≠ credits ${totalCredit}`;
  return null;
}
