/**
 * Pure helpers for importing bank / card CSV exports as journal entries.
 * No prisma or server-only imports, so this runs in the browser (preview) and
 * on the server (validation) and is unit-tested without a database.
 *
 * Sign convention used throughout: a row's `amount` is signed integer cents
 * from the point of view of the account being imported into — positive is
 * money INTO the account (a deposit, or a payment/refund on a card), negative
 * is money OUT (a withdrawal, or a card charge). Money in is always a debit to
 * that account and money out a credit, for both asset and liability accounts.
 */
import { checkBalanced } from "./ledger";

export const MAX_IMPORT_ROWS = 2000;
export const MATCH_TOLERANCE_DAYS = 5;

// ------------------------------------------------------------------ parsing

/** RFC-4180-style CSV parse: quoted fields, "" escapes, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((cell) => cell.trim()))
    .filter((r) => r.some((cell) => cell !== ""));
}

export type DateFormat = "MDY" | "DMY";

/** Parse a bank-export date to yyyy-mm-dd, or null when it isn't a real date. */
export function parseCsvDate(value: string, format: DateFormat = "MDY"): string | null {
  const v = value.trim().split(/[T\s]/)[0];
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const parts = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (iso) {
    [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  } else if (parts) {
    const a = +parts[1];
    const b = +parts[2];
    y = +parts[3];
    if (parts[3].length === 2) y += 2000;
    [m, d] = format === "MDY" ? [a, b] : [b, a];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a statement amount to signed integer cents, or null when it isn't a
 * number. Understands "$1,234.56", "(12.00)", "-12.00", "12.00-", and
 * trailing CR / DR markers. Works on the digits directly — no float math.
 */
export function parseCsvAmount(value: string): number | null {
  let v = value.trim().replace(/[$\s,]/g, "");
  if (v === "") return null;
  let negative = false;
  const marker = v.match(/(CR|DR)$/i);
  if (marker) {
    v = v.slice(0, -2);
    if (marker[1].toUpperCase() === "DR") negative = !negative;
  }
  if (/^\(.*\)$/.test(v)) {
    negative = !negative;
    v = v.slice(1, -1);
  }
  if (v.endsWith("-")) {
    negative = !negative;
    v = v.slice(0, -1);
  }
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  } else if (v.startsWith("+")) v = v.slice(1);
  const m = v.match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (m[1] === "" && !m[2])) return null;
  const frac = (m[2] ?? "").padEnd(3, "0");
  let cents = Number(m[1] || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

// ----------------------------------------------------------- column mapping

/**
 * How the file expresses direction:
 *  - signed:    one Amount column; positive = money in (flip for card exports
 *               that list charges as positive)
 *  - indicator: an unsigned Amount column plus a Credit/Debit column
 *  - split:     separate money-out and money-in columns
 */
export type AmountMode = "signed" | "indicator" | "split";

export type ColumnMapping = {
  date: number;
  description: number;
  reference: number; // -1 = none
  mode: AmountMode;
  amount: number;
  indicator: number;
  moneyOut: number;
  moneyIn: number;
  flipSign: boolean;
  dateFormat: DateFormat;
};

function findColumn(header: string[], patterns: RegExp[]): number {
  const names = header.map((h) => h.toLowerCase().trim());
  for (const pattern of patterns) {
    const idx = names.findIndex((n) => pattern.test(n));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Best-guess mapping from a header row; every guess is editable in the UI. */
export function detectColumns(header: string[]): ColumnMapping {
  const date = findColumn(header, [/^transaction date$/, /^date$/, /^post(ing|ed)? date$/, /date/]);
  const description = findColumn(header, [/^description$/, /^memo$/, /^payee$/, /^name$/, /description|memo|payee|details|narrative/]);
  const reference = findColumn(header, [/^check serial number$/, /^check (number|no\.?|#)$/, /check.*(number|no|#)/, /^reference$/, /^ref/]);
  const amount = findColumn(header, [/^amount$/, /^transaction amount$/, /amount/]);
  const indicator = findColumn(header, [/credit.?debit|debit.?credit|^indicator$|^dr.?cr$|^cr.?dr$/, /^transaction type$/]);
  const moneyOut = findColumn(header, [/^debit$/, /^withdrawals?$/, /^money out$/, /^paid out$/, /debit|withdraw/]);
  const moneyIn = findColumn(header, [/^credit$/, /^deposits?$/, /^money in$/, /^paid in$/, /credit|deposit/]);
  // A combined "Credit Debit Indicator" column matches the debit/credit
  // patterns too; it's not an amount column.
  const splitOk = moneyOut >= 0 && moneyIn >= 0 && moneyOut !== moneyIn && moneyOut !== indicator && moneyIn !== indicator;
  const mode: AmountMode = amount >= 0 && indicator >= 0 ? "indicator" : amount >= 0 ? "signed" : splitOk ? "split" : "signed";
  return {
    date,
    description,
    reference,
    mode,
    amount,
    indicator,
    moneyOut: splitOk ? moneyOut : -1,
    moneyIn: splitOk ? moneyIn : -1,
    flipSign: false,
    dateFormat: "MDY",
  };
}

/** Does the first row look like column names rather than data? */
export function looksLikeHeader(row: string[]): boolean {
  return !row.some((cell) => parseCsvDate(cell) !== null || (cell !== "" && parseCsvAmount(cell) !== null));
}

// ------------------------------------------------- remembered column mapping

/**
 * A column mapping remembered for one account, with a fingerprint of the file
 * layout it was made for. It's only reused on a file with the same layout, so
 * a different export never gets its columns silently mis-read.
 */
export type SavedMapping = { layout: string; hasHeader: boolean; mapping: ColumnMapping };

/** Fingerprint of a file's layout: its column names, or just the column count. */
export function fileLayout(firstRow: string[], columnCount: number, hasHeader: boolean): string {
  return hasHeader
    ? `names:${firstRow.map((h) => h.trim().toLowerCase()).join("|")}`
    : `columns:${columnCount}`;
}

export function encodeSavedMapping(
  firstRow: string[],
  columnCount: number,
  hasHeader: boolean,
  mapping: ColumnMapping
): string {
  const saved: SavedMapping = { layout: fileLayout(firstRow, columnCount, hasHeader), hasHeader, mapping };
  return JSON.stringify(saved);
}

/** Parse stored JSON back to a SavedMapping, or null if it isn't a well-formed one. */
export function parseSavedMapping(json: string | null | undefined): SavedMapping | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { layout, hasHeader, mapping } = raw as Record<string, unknown>;
  if (typeof layout !== "string" || typeof hasHeader !== "boolean" || !mapping || typeof mapping !== "object") return null;
  const m = mapping as Record<string, unknown>;
  const column = (v: unknown) => Number.isInteger(v) && (v as number) >= -1 && (v as number) < 1000;
  const columns = ["date", "description", "reference", "amount", "indicator", "moneyOut", "moneyIn"];
  if (!columns.every((key) => column(m[key]))) return null;
  if (m.mode !== "signed" && m.mode !== "indicator" && m.mode !== "split") return null;
  if (m.dateFormat !== "MDY" && m.dateFormat !== "DMY") return null;
  if (typeof m.flipSign !== "boolean") return null;
  return {
    layout,
    hasHeader,
    mapping: {
      date: m.date as number,
      description: m.description as number,
      reference: m.reference as number,
      mode: m.mode,
      amount: m.amount as number,
      indicator: m.indicator as number,
      moneyOut: m.moneyOut as number,
      moneyIn: m.moneyIn as number,
      flipSign: m.flipSign,
      dateFormat: m.dateFormat,
    },
  };
}

/** The remembered mapping, if it was saved for a file laid out like this one. */
export function savedMappingForFile(
  json: string | null | undefined,
  firstRow: string[],
  columnCount: number
): SavedMapping | null {
  const saved = parseSavedMapping(json);
  if (!saved || saved.layout !== fileLayout(firstRow, columnCount, saved.hasHeader)) return null;
  const m = saved.mapping;
  const highest = Math.max(m.date, m.description, m.reference, m.amount, m.indicator, m.moneyOut, m.moneyIn);
  return highest < columnCount ? saved : null;
}

// ------------------------------------------------------------- row building

export type ImportRow = {
  /** 1-based line in the file's data rows, for error messages. */
  line: number;
  date: string; // yyyy-mm-dd
  description: string;
  reference: string;
  amount: number; // signed cents; positive = money into the account
};

export type RowError = { line: number; message: string };

function indicatorSign(value: string): 1 | -1 | null {
  const v = value.trim().toLowerCase();
  if (/^(credit|cr|deposit|in)\b/.test(v)) return 1;
  if (/^(debit|dr|withdrawal|out|check|payment)\b/.test(v)) return -1;
  return null;
}

/** Turn raw data rows into signed, dated import rows using the mapping. */
export function buildImportRows(
  dataRows: string[][],
  mapping: ColumnMapping
): { rows: ImportRow[]; errors: RowError[] } {
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  dataRows.forEach((cells, i) => {
    const line = i + 1;
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? "") : "");
    const fail = (message: string) => errors.push({ line, message });

    const date = parseCsvDate(cell(mapping.date), mapping.dateFormat);
    if (!date) return fail(`Unreadable date "${cell(mapping.date)}"`);

    let amount: number | null;
    if (mapping.mode === "split") {
      const out = cell(mapping.moneyOut) ? parseCsvAmount(cell(mapping.moneyOut)) : 0;
      const into = cell(mapping.moneyIn) ? parseCsvAmount(cell(mapping.moneyIn)) : 0;
      if (out === null || into === null) return fail("Unreadable amount");
      amount = Math.abs(into) - Math.abs(out);
    } else {
      amount = parseCsvAmount(cell(mapping.amount));
      if (amount === null) return fail(`Unreadable amount "${cell(mapping.amount)}"`);
      if (mapping.mode === "indicator") {
        const sign = indicatorSign(cell(mapping.indicator));
        if (sign === null) return fail(`Can't tell money in from money out: "${cell(mapping.indicator)}"`);
        amount = sign * Math.abs(amount);
      }
    }
    if (mapping.flipSign) amount = -amount;
    if (amount === 0) return fail("Zero amount");

    rows.push({
      line,
      date,
      description: cell(mapping.description).replace(/\s+/g, " ").trim(),
      reference: cell(mapping.reference),
      amount,
    });
  });
  return { rows, errors };
}

/**
 * Indexes of rows that repeat an earlier row's date and amount. Some banks
 * export one transaction twice with different descriptions, so these default
 * to "skip" — but two real same-day, same-amount transactions look identical,
 * so it's a flag for the user, not a silent drop.
 */
export function findRepeatsInFile(rows: Pick<ImportRow, "date" | "amount">[]): Set<number> {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  rows.forEach((row, i) => {
    const key = `${row.date}|${row.amount}`;
    if (seen.has(key)) repeats.add(i);
    else seen.add(key);
  });
  return repeats;
}

// ------------------------------------------------- matching existing ledger

export type LedgerLine = {
  id: string;
  date: string; // yyyy-mm-dd
  debit: number;
  credit: number;
};

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`) / 86400000;

/**
 * Pair each import row with at most one existing ledger line on the same
 * account that already records it: same side and amount, dated within the
 * tolerance. Exact-date pairs are taken first, then the nearest date; each
 * ledger line is used once. Returns ledger line ids by row index.
 */
export function matchExistingLines(
  rows: Pick<ImportRow, "date" | "amount">[],
  ledger: LedgerLine[],
  toleranceDays = MATCH_TOLERANCE_DAYS
): Map<number, string> {
  const matches = new Map<number, string>();
  const used = new Set<string>();
  for (const tolerance of toleranceDays > 0 ? [0, toleranceDays] : [0]) {
    rows.forEach((row, i) => {
      if (matches.has(i)) return;
      const day = dayNumber(row.date);
      let best: LedgerLine | null = null;
      let bestGap = Infinity;
      for (const line of ledger) {
        if (used.has(line.id)) continue;
        const sameAmount = row.amount > 0 ? line.debit === row.amount : line.credit === -row.amount;
        if (!sameAmount) continue;
        const gap = Math.abs(dayNumber(line.date) - day);
        if (gap <= tolerance && gap < bestGap) {
          best = line;
          bestGap = gap;
        }
      }
      if (best) {
        used.add(best.id);
        matches.set(i, best.id);
      }
    });
  }
  return matches;
}

// -------------------------------------------------------- categorization rules

export type CategoryRule = { id: string; match: string; categoryAccountId: string };

/** Case- and spacing-insensitive form used to compare rule text with descriptions. */
export function normalizeRuleText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The rule that applies to a description: one whose text appears anywhere in
 * it, ignoring case and extra spaces. When several apply, the longest text
 * wins (it's the most specific); a tie goes to the earlier rule in the list.
 * Rules pointing at the account being imported into never apply.
 */
export function findCategoryRule<R extends CategoryRule>(
  description: string,
  rules: R[],
  importAccountId = ""
): R | null {
  const haystack = normalizeRuleText(description);
  let best: R | null = null;
  let bestLength = 0;
  for (const rule of rules) {
    const needle = normalizeRuleText(rule.match);
    if (!needle || rule.categoryAccountId === importAccountId) continue;
    if (needle.length > bestLength && haystack.includes(needle)) {
      best = rule;
      bestLength = needle.length;
    }
  }
  return best;
}

// ---------------------------------------------------------------- posting

export type EntryLineDraft = { accountId: string; debit: number; credit: number };

/**
 * One category's share of a row. `amount` is cents in the row's own direction:
 * the parts of a $500 payment are positive and add up to 500. A negative part
 * goes the other way — a $970 deposit can be $1,000 of sales and −$30 of fees.
 */
export type SplitPart = { categoryAccountId: string; amount: number };

/**
 * The balanced posting for one imported row split across categories: one line
 * on the imported account for the full amount (money in is a debit, money out
 * a credit) and one line per part on the other side. The parts must add up to
 * the row's amount. Returns an error string when they can't form a valid entry.
 */
export function entryLinesForSplit(
  amount: number,
  accountId: string,
  parts: SplitPart[]
): { lines: EntryLineDraft[] } | { error: string } {
  if (!Number.isSafeInteger(amount) || amount === 0) return { error: "Amount must be a non-zero number of cents" };
  if (!accountId || parts.length === 0 || parts.some((p) => !p.categoryAccountId)) return { error: "Missing category account" };
  if (parts.some((p) => p.categoryAccountId === accountId)) return { error: "Category can't be the account being imported into" };
  if (parts.some((p) => !Number.isSafeInteger(p.amount) || p.amount === 0)) return { error: "Each split needs a non-zero amount" };
  const cents = Math.abs(amount);
  if (parts.reduce((sum, p) => sum + p.amount, 0) !== cents) return { error: "Split amounts don't add up to the transaction amount" };
  const moneyIn = amount > 0;
  const accountLine: EntryLineDraft = moneyIn ? { accountId, debit: cents, credit: 0 } : { accountId, debit: 0, credit: cents };
  const partLines: EntryLineDraft[] = parts.map((p) => {
    // A positive part sits opposite the account line; a negative one beside it.
    const debit = moneyIn ? p.amount < 0 : p.amount > 0;
    const value = Math.abs(p.amount);
    return { accountId: p.categoryAccountId, debit: debit ? value : 0, credit: debit ? 0 : value };
  });
  const lines = moneyIn ? [accountLine, ...partLines] : [...partLines, accountLine];
  const balanceError = checkBalanced(lines);
  if (balanceError) return { error: balanceError };
  return { lines };
}

/**
 * The balanced two-line posting for one imported row: money in debits the
 * imported account and credits the category; money out is the reverse.
 */
export function entryLinesForRow(
  amount: number,
  accountId: string,
  categoryAccountId: string
): { lines: EntryLineDraft[] } | { error: string } {
  return entryLinesForSplit(amount, accountId, [{ categoryAccountId, amount: Math.abs(amount) }]);
}
