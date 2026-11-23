import "server-only";
import { prisma } from "./db";
import { getBalances } from "./accounting";
import { signedBalance } from "./types";
import type { OpenDoc } from "./ageing";
import { buildCashFlow, classifyAccounts, type CashFlowSection } from "./cashFlow";
import { budgetReport, type YearMonth } from "./budget";
import { contactPayments } from "./vendorPayments";

// Database reads behind the ageing, cash flow, vendor payment and budget
// reports. The arithmetic lives in the pure modules imported above.

/**
 * Unpaid invoices on a date: what is still owed on each is the balance of
 * Accounts Receivable across that invoice's posted entries up to the date.
 */
export async function openInvoices(businessId: string, asOf: Date): Promise<OpenDoc[]> {
  const receivable = await prisma.account.findFirst({
    where: { businessId, type: "ASSET", name: "Accounts Receivable" },
  });
  if (!receivable) return [];
  const invoices = await prisma.invoice.findMany({
    where: { businessId, status: { in: ["SENT", "PAID"] }, issueDate: { lte: asOf } },
    include: {
      customer: { select: { name: true } },
      entries: {
        where: { status: "POSTED", date: { lte: asOf } },
        select: { lines: { where: { accountId: receivable.id }, select: { debit: true, credit: true } } },
      },
    },
  });
  return invoices.map((invoice) => ({
    id: invoice.id,
    label: invoice.number,
    contactId: invoice.customerId,
    contactName: invoice.customer.name,
    date: invoice.issueDate,
    dueDate: invoice.dueDate,
    open: invoice.entries.reduce((s, e) => s + e.lines.reduce((t, l) => t + l.debit - l.credit, 0), 0),
  }));
}

/** Unpaid bills on a date — the Accounts Payable balance left on each. */
export async function openBills(businessId: string, asOf: Date): Promise<OpenDoc[]> {
  const payable = await prisma.account.findFirst({
    where: { businessId, type: "LIABILITY", name: "Accounts Payable" },
  });
  if (!payable) return [];
  const bills = await prisma.bill.findMany({
    where: { businessId, status: { in: ["OPEN", "PAID"] }, billDate: { lte: asOf } },
    include: {
      vendor: { select: { name: true } },
      entries: {
        where: { status: "POSTED", date: { lte: asOf } },
        select: { lines: { where: { accountId: payable.id }, select: { debit: true, credit: true } } },
      },
    },
  });
  return bills.map((bill) => ({
    id: bill.id,
    label: bill.number || "Bill",
    contactId: bill.vendorId,
    contactName: bill.vendor.name,
    date: bill.billDate,
    dueDate: bill.dueDate,
    open: bill.entries.reduce((s, e) => s + e.lines.reduce((t, l) => t + l.credit - l.debit, 0), 0),
  }));
}

/** Every account's cash-flow section, using what the ledger knows about it. */
export async function cashFlowSections(businessId: string) {
  const [accounts, reconciled, loans] = await Promise.all([
    prisma.account.findMany({ where: { businessId } }),
    prisma.reconciliation.findMany({ where: { businessId }, select: { accountId: true }, distinct: ["accountId"] }),
    prisma.loan.findMany({ where: { businessId }, select: { liabilityAccountId: true } }),
  ]);
  const cashIds = new Set([
    ...reconciled.map((r) => r.accountId),
    ...accounts.filter((a) => a.importMapping && a.type === "ASSET").map((a) => a.id),
  ]);
  const sections = classifyAccounts(accounts, {
    cashIds,
    loanLiabilityIds: new Set(loans.map((l) => l.liabilityAccountId)),
  });
  return { accounts, sections, reconciledIds: new Set(reconciled.map((r) => r.accountId)) };
}

export async function cashAccountIds(businessId: string): Promise<Set<string>> {
  const { sections } = await cashFlowSections(businessId);
  return new Set([...sections].filter(([, s]) => s === "CASH").map(([id]) => id));
}

export async function cashFlowStatement(businessId: string, from: Date | undefined, to: Date) {
  const dayBefore = from ? new Date(from.getTime() - 86400000) : undefined;
  const [{ accounts, sections }, opening, period] = await Promise.all([
    cashFlowSections(businessId),
    dayBefore ? getBalances(businessId, { to: dayBefore }) : Promise.resolve(new Map()),
    getBalances(businessId, { from, to }),
  ]);
  const statement = buildCashFlow(accounts, sections, opening, period);
  const cashAccounts = accounts
    .filter((a) => sections.get(a.id) === "CASH")
    .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
  return { ...statement, cashAccounts, sections: sections as Map<string, CashFlowSection> };
}

/** Cash paid to each contact in a calendar year (see vendorPayments.ts). */
export async function vendorPaymentTotals(businessId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const cashIds = await cashAccountIds(businessId);
  const [entries, contacts] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        businessId,
        status: "POSTED",
        date: { gte: from, lte: to },
        lines: { some: { accountId: { in: [...cashIds] }, credit: { gt: 0 } } },
      },
      select: { lines: { select: { accountId: true, contactId: true, debit: true, credit: true } } },
    }),
    prisma.contact.findMany({ where: { businessId }, include: { type: true } }),
  ]);
  const totals = contactPayments(entries, cashIds);
  const rows = contacts
    .filter((c) => totals.has(c.id))
    .map((c) => ({ contact: c, typeName: c.type?.name ?? null, paid: totals.get(c.id) ?? 0 }))
    .sort((a, b) => b.paid - a.paid);
  return { from, to, rows, hasCashAccounts: cashIds.size > 0 };
}

/** Budget and actual per income/expense account over a run of months. */
export async function budgetVsActual(businessId: string, months: YearMonth[]) {
  if (months.length === 0) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const from = new Date(Date.UTC(first.year, first.month - 1, 1));
  const to = new Date(Date.UTC(last.year, last.month, 0));
  const years = [...new Set(months.map((m) => m.year))];
  const [accounts, balances, budgets] = await Promise.all([
    prisma.account.findMany({ where: { businessId, type: { in: ["INCOME", "EXPENSE"] } } }),
    getBalances(businessId, { from, to }),
    prisma.budget.findMany({ where: { businessId, year: { in: years } } }),
  ]);
  const inRange = new Set(months.map((m) => `${m.year}-${m.month}`));
  const actual = new Map<string, number>();
  for (const account of accounts) {
    const raw = balances.get(account.id);
    if (raw) actual.set(account.id, signedBalance(account.type, raw.debit, raw.credit));
  }
  const budget = new Map<string, number>();
  for (const b of budgets) {
    if (!inRange.has(`${b.year}-${b.month}`)) continue;
    budget.set(b.accountId, (budget.get(b.accountId) ?? 0) + b.amount);
  }
  return { from, to, hasBudget: budget.size > 0, ...budgetReport(accounts, actual, budget) };
}
