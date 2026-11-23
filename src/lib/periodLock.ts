/**
 * Closing date ("period lock"), as a pure function. Once the books are closed
 * through a date, nothing dated on or before it may be posted, edited, voided
 * or deleted — so a filed period can't change by accident.
 *
 * Dates are UTC calendar dates. Returns an error message, or null when every
 * date falls after the closing date (or no closing date is set).
 */
export function lockedDateError(lockDate: Date | null | undefined, dates: Date[]): string | null {
  if (!lockDate) return null;
  const hit = dates.find((d) => d.getTime() <= lockDate.getTime());
  if (!hit) return null;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `The books are closed through ${iso(lockDate)}, so a transaction dated ${iso(hit)} can't be added or changed. Move the closing date first (Settings → Closing date).`;
}
