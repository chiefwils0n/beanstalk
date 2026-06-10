export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function parseMoney(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(n * 100);
}

/** Parse a yyyy-mm-dd input as a UTC date. */
export function parseDate(input: string): Date {
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
}

export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function todayUTC(): Date {
  return parseDate(new Date().toISOString().slice(0, 10));
}
