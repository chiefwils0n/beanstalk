/**
 * Match a bank CSV export against the ledger and mark matched lines CLEARED.
 *
 * Usage:
 *   npx tsx scripts/clear-bank-csv.ts <csv> <account-name> <business-name> <after-MM/DD/YYYY> [--apply]
 *
 * For each bank row dated after <after> (your last reconcile date), finds an
 * unreconciled ledger line on <account> with the same amount and side within a
 * date tolerance, and (with --apply) marks it CLEARED. Defaults to a read-only
 * dry run. Reports rows that don't match so you can decide whether to add them.
 *
 * Bank-side mapping: a statement "Debit" (money out) = a credit to the asset
 * account; a "Credit" (money in) = a debit. (Reversed for liability accounts.)
 */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";

const TOLERANCE_DAYS = 10;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseUsDate(v: string): Date {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error(`bad date ${v}`);
  return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
}

async function main() {
  const [csvPath, accountName, businessName, afterStr, ...flags] = process.argv.slice(2);
  if (!csvPath || !accountName || !businessName || !afterStr) {
    console.error("Usage: clear-bank-csv.ts <csv> <account-name> <business-name> <after-MM/DD/YYYY> [--apply]");
    process.exit(1);
  }
  const apply = flags.includes("--apply");
  const after = parseUsDate(afterStr);

  const business = await prisma.business.findFirstOrThrow({ where: { name: businessName } });
  const account = await prisma.account.findFirstOrThrow({ where: { businessId: business.id, name: accountName } });
  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";

  // ---- parse + dedupe the bank rows after the reconcile date
  const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const ci = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cDate = ci("Transaction Date");
  const cAmt = ci("Amount");
  const cInd = ci("Credit Debit Indicator");
  const cDesc = ci("Description");

  type Row = { date: Date; cents: number; indicator: string; desc: string };
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const raw of lines.slice(1)) {
    if (!raw.trim()) continue;
    const f = parseCsvLine(raw);
    if (!f[cDate] || !f[cAmt]) continue;
    const date = parseUsDate(f[cDate]);
    if (date <= after) continue;
    const cents = Math.round(Number(f[cAmt].replace(/[$,]/g, "")) * 100);
    const indicator = f[cInd];
    // collapse the export's duplicate representations of one transaction
    const key = `${f[cDate]}|${cents}|${indicator}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ date, cents, indicator, desc: f[cDesc] });
  }
  rows.sort((a, b) => +a.date - +b.date);

  // ---- candidate ledger lines: this account, posted, not yet reconciled/cleared
  const candidates = await prisma.journalLine.findMany({
    where: { accountId: account.id, cleared: "NONE", entry: { businessId: business.id, status: "POSTED" } },
    include: { entry: { select: { date: true, memo: true } } },
  });
  const consumed = new Set<string>();

  const toClear: string[] = [];
  const unmatched: Row[] = [];
  for (const row of rows) {
    // statement debit (money out) hits the credit side of an asset account
    const wantDebit = row.indicator === "Credit" ? isDebitNormal : !isDebitNormal;
    const pool = candidates
      .filter((l) => !consumed.has(l.id))
      .filter((l) => (wantDebit ? l.debit === row.cents : l.credit === row.cents))
      .filter((l) => Math.abs(+l.entry.date - +row.date) <= TOLERANCE_DAYS * 86400000)
      .sort((a, b) => Math.abs(+a.entry.date - +row.date) - Math.abs(+b.entry.date - +row.date));
    if (pool.length === 0) { unmatched.push(row); continue; }
    consumed.add(pool[0].id);
    toClear.push(pool[0].id);
  }

  const fmt = (c: number) => "$" + (c / 100).toFixed(2);
  console.log(JSON.stringify({
    apply,
    bankRowsAfter: rows.length,
    matched: toClear.length,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.map((r) => `${r.date.toISOString().slice(0, 10)} ${r.indicator} ${fmt(r.cents)} — ${r.desc}`),
    ledgerLinesStillUncleared: candidates.length - toClear.length,
  }, null, 1));

  if (apply && toClear.length) {
    await prisma.journalLine.updateMany({ where: { id: { in: toClear } }, data: { cleared: "CLEARED" } });
    console.log(`APPLIED: marked ${toClear.length} lines CLEARED.`);
  } else if (!apply) {
    console.log("Dry run — nothing changed. Re-run with --apply to mark matches cleared.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
