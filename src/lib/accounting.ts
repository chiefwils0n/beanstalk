import { prisma } from "./db";
import { signedBalance } from "./types";
import type { Account } from "@prisma/client";

export type AccountNode = {
  account: Account;
  /** Activity posted directly to this account (signed by account type). */
  own: number;
  /** Own balance plus all descendants. */
  total: number;
  children: AccountNode[];
};

type RawBalance = { debit: number; credit: number };

export async function getBalances(
  businessId: string,
  opts: { from?: Date; to?: Date; classId?: string } = {}
): Promise<Map<string, RawBalance>> {
  const lines = await prisma.journalLine.findMany({
    where: {
      classId: opts.classId,
      entry: {
        businessId,
        status: "POSTED",
        date: { gte: opts.from, lte: opts.to },
      },
    },
    select: { accountId: true, debit: true, credit: true },
  });
  const map = new Map<string, RawBalance>();
  for (const line of lines) {
    const cur = map.get(line.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += line.debit;
    cur.credit += line.credit;
    map.set(line.accountId, cur);
  }
  return map;
}

export function buildTree(
  accounts: Account[],
  balances: Map<string, RawBalance>,
  opts: { includeArchived?: boolean } = {}
): AccountNode[] {
  const nodes = new Map<string, AccountNode>();
  for (const account of accounts) {
    const raw = balances.get(account.id) ?? { debit: 0, credit: 0 };
    const own = signedBalance(account.type, raw.debit, raw.credit);
    nodes.set(account.id, { account, own, total: own, children: [] });
  }
  const roots: AccountNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.account.parentId ? nodes.get(node.account.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: AccountNode[]) => {
    list.sort((a, b) =>
      (a.account.code ?? a.account.name).localeCompare(b.account.code ?? b.account.name)
    );
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  const rollup = (node: AccountNode): number => {
    node.total = node.own + node.children.reduce((sum, c) => sum + rollup(c), 0);
    return node.total;
  };
  for (const root of roots) rollup(root);
  if (!opts.includeArchived) {
    const prune = (list: AccountNode[]): AccountNode[] =>
      list
        .filter((n) => !n.account.isArchived || n.total !== 0 || n.children.length > 0)
        .map((n) => ({ ...n, children: prune(n.children) }));
    return prune(roots);
  }
  return roots;
}

export function sumTree(nodes: AccountNode[]): number {
  return nodes.reduce((sum, n) => sum + n.total, 0);
}

/** Flatten the account hierarchy into select-friendly options. */
export function flattenAccounts(
  accounts: Account[]
): { id: string; label: string; type: string; depth: number }[] {
  const byParent = new Map<string | null, Account[]>();
  for (const account of accounts) {
    const key = account.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), account]);
  }
  const out: { id: string; label: string; type: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = (byParent.get(parentId) ?? []).sort((a, b) =>
      (a.code ?? a.name).localeCompare(b.code ?? b.name)
    );
    for (const account of list) {
      out.push({
        id: account.id,
        label: `${"  ".repeat(depth)}${account.code ? account.code + " · " : ""}${account.name}`,
        type: account.type,
        depth,
      });
      walk(account.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export async function getAccountsByType(businessId: string, type: string) {
  return prisma.account.findMany({
    where: { businessId, type, isArchived: false },
    orderBy: { code: "asc" },
  });
}

/**
 * An account id plus all of its descendant account ids — for "include
 * sub-accounts" filters, so drilling a parent matches its rolled-up balance.
 */
export async function accountWithDescendants(
  businessId: string,
  accountId: string
): Promise<string[]> {
  const accounts = await prisma.account.findMany({
    where: { businessId },
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<string, string[]>();
  for (const a of accounts) {
    if (!a.parentId) continue;
    const arr = childrenByParent.get(a.parentId) ?? [];
    arr.push(a.id);
    childrenByParent.set(a.parentId, arr);
  }
  const out: string[] = [];
  const stack = [accountId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return out;
}

export async function profitAndLoss(
  businessId: string,
  from: Date | undefined,
  to: Date,
  classId?: string
) {
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId, type: { in: ["INCOME", "EXPENSE"] } } }),
    getBalances(businessId, { from, to, classId }),
  ]);
  const income = buildTree(accounts.filter((a) => a.type === "INCOME"), balances);
  const expenses = buildTree(accounts.filter((a) => a.type === "EXPENSE"), balances);
  const totalIncome = sumTree(income);
  const totalExpenses = sumTree(expenses);
  return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
}

// ----------------------------------------------------- P&L by class (matrix)

export type ClassColumn = { key: string; name: string };

export type ClassMatrixNode = {
  account: Account;
  /** Direct (own) signed amount per column key, excluding descendants. */
  own: Record<string, number>;
  /** Signed amount per column key, rolled up to include descendants. */
  values: Record<string, number>;
  /** Row total across all columns (rolled up). */
  total: number;
  children: ClassMatrixNode[];
};

export const UNCLASSIFIED_KEY = "__none__";

/**
 * Profit & Loss broken out by class: income/expense accounts as rows, each
 * class (plus an Unclassified bucket and a Total) as a column. Only classes
 * with activity in the period get a column.
 */
export async function profitAndLossByClass(
  businessId: string,
  from: Date | undefined,
  to: Date
) {
  const [accounts, lines, classes] = await Promise.all([
    prisma.account.findMany({ where: { businessId, type: { in: ["INCOME", "EXPENSE"] } } }),
    prisma.journalLine.findMany({
      where: {
        account: { businessId, type: { in: ["INCOME", "EXPENSE"] } },
        entry: { businessId, status: "POSTED", date: { gte: from, lte: to } },
      },
      select: { accountId: true, classId: true, debit: true, credit: true },
    }),
    prisma.class.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
  ]);

  const acctById = new Map(accounts.map((a) => [a.id, a]));

  // Columns: only classes that actually have income/expense activity, then an
  // Unclassified column if any such lines have no class.
  const usedClassIds = new Set<string>();
  let hasUnclassified = false;
  for (const l of lines) {
    if (l.classId) usedClassIds.add(l.classId);
    else hasUnclassified = true;
  }
  const columns: ClassColumn[] = classes
    .filter((c) => usedClassIds.has(c.id))
    .map((c) => ({ key: c.id, name: c.name }));
  if (hasUnclassified) columns.push({ key: UNCLASSIFIED_KEY, name: "Unclassified" });
  const colKeys = columns.map((c) => c.key);

  // Direct (own) signed balance per account, per column.
  const own = new Map<string, Record<string, number>>();
  for (const l of lines) {
    const acct = acctById.get(l.accountId);
    if (!acct) continue;
    const col = l.classId ?? UNCLASSIFIED_KEY;
    const signed = signedBalance(acct.type, l.debit, l.credit);
    let row = own.get(l.accountId);
    if (!row) {
      row = {};
      own.set(l.accountId, row);
    }
    row[col] = (row[col] ?? 0) + signed;
  }

  function buildMatrix(typeAccounts: Account[]): ClassMatrixNode[] {
    const nodes = new Map<string, ClassMatrixNode>();
    for (const account of typeAccounts) {
      const ownRow = own.get(account.id) ?? {};
      const direct: Record<string, number> = {};
      const values: Record<string, number> = {};
      for (const k of colKeys) {
        direct[k] = ownRow[k] ?? 0;
        values[k] = ownRow[k] ?? 0;
      }
      nodes.set(account.id, { account, own: direct, values, total: 0, children: [] });
    }
    const roots: ClassMatrixNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.account.parentId ? nodes.get(node.account.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const sortRec = (list: ClassMatrixNode[]) => {
      list.sort((a, b) =>
        (a.account.code ?? a.account.name).localeCompare(b.account.code ?? b.account.name)
      );
      list.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    const rollup = (node: ClassMatrixNode) => {
      for (const child of node.children) {
        rollup(child);
        for (const k of colKeys) node.values[k] += child.values[k];
      }
      node.total = colKeys.reduce((s, k) => s + node.values[k], 0);
    };
    roots.forEach(rollup);
    // This is a period-activity report: drop accounts with no activity in any
    // column (keeping parents that still have a surviving child).
    const hasActivity = (n: ClassMatrixNode) => colKeys.some((k) => n.values[k] !== 0);
    const prune = (list: ClassMatrixNode[]): ClassMatrixNode[] =>
      list
        .map((n) => ({ ...n, children: prune(n.children) }))
        .filter((n) => hasActivity(n) || n.children.length > 0);
    return prune(roots);
  }

  const income = buildMatrix(accounts.filter((a) => a.type === "INCOME"));
  const expenses = buildMatrix(accounts.filter((a) => a.type === "EXPENSE"));

  const colTotal = (rows: ClassMatrixNode[], key: string) =>
    rows.reduce((s, n) => s + n.values[key], 0);

  const incomeTotals: Record<string, number> = {};
  const expenseTotals: Record<string, number> = {};
  const netTotals: Record<string, number> = {};
  for (const k of colKeys) {
    incomeTotals[k] = colTotal(income, k);
    expenseTotals[k] = colTotal(expenses, k);
    netTotals[k] = incomeTotals[k] - expenseTotals[k];
  }
  const totalIncome = colKeys.reduce((s, k) => s + incomeTotals[k], 0);
  const totalExpenses = colKeys.reduce((s, k) => s + expenseTotals[k], 0);

  return {
    columns,
    income,
    expenses,
    incomeTotals,
    expenseTotals,
    netTotals,
    totalIncome,
    totalExpenses,
    netIncome: totalIncome - totalExpenses,
  };
}

export async function balanceSheet(businessId: string, asOf: Date) {
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId } }),
    getBalances(businessId, { to: asOf }),
  ]);
  const assets = buildTree(accounts.filter((a) => a.type === "ASSET"), balances);
  const liabilities = buildTree(accounts.filter((a) => a.type === "LIABILITY"), balances);
  const equity = buildTree(accounts.filter((a) => a.type === "EQUITY"), balances);
  const income = sumTree(buildTree(accounts.filter((a) => a.type === "INCOME"), balances));
  const expenses = sumTree(buildTree(accounts.filter((a) => a.type === "EXPENSE"), balances));
  const netIncome = income - expenses; // lifetime-to-date earnings shown in equity
  return {
    assets,
    liabilities,
    equity,
    netIncome,
    totalAssets: sumTree(assets),
    totalLiabilities: sumTree(liabilities),
    totalEquity: sumTree(equity) + netIncome,
  };
}

export type TrialBalanceRow = {
  account: { id: string; code: string | null; name: string; type: string };
  debit: number;
  credit: number;
  synthetic?: boolean;
};

/**
 * Trial balance as of `to`, optionally for a period starting at `from`.
 *
 * A trial balance is a point-in-time snapshot, so balance-sheet accounts
 * (asset/liability/equity) are **cumulative through `to`** — not just the
 * period's movement. Income/expense accounts show only the period (`from`..`to`),
 * matching how a P&L is read for the year.
 *
 * Because Beanstalk keeps a continuous ledger (no year-end closing entry), the
 * earnings accumulated *before* `from` aren't sitting in an equity account — so
 * we derive them and add a synthetic "Retained Earnings (prior periods)" row.
 * Without it the cumulative balance-sheet side wouldn't equal the period-only
 * income/expense side. This mirrors how QuickBooks reports Retained Earnings.
 */
export async function trialBalance(businessId: string, from?: Date, to?: Date) {
  const [accounts, cumulative, period] = await Promise.all([
    prisma.account.findMany({ where: { businessId }, orderBy: { code: "asc" } }),
    getBalances(businessId, { to }), // cumulative through `to` (balance-sheet accounts)
    getBalances(businessId, { from, to }), // period activity (income/expense accounts)
  ]);
  const isPL = (t: string) => t === "INCOME" || t === "EXPENSE";
  const rows: TrialBalanceRow[] = accounts
    .map((account) => {
      const raw = (isPL(account.type) ? period : cumulative).get(account.id) ?? { debit: 0, credit: 0 };
      const net = raw.debit - raw.credit;
      return { account, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  if (from) {
    // Earnings before `from` = (income/expense cumulative through `to`) minus
    // (income/expense for the period). Carried into equity as retained earnings.
    let priorNet = 0; // (debit − credit); positive = accumulated loss (debit)
    for (const a of accounts) {
      if (!isPL(a.type)) continue;
      const c = cumulative.get(a.id) ?? { debit: 0, credit: 0 };
      const p = period.get(a.id) ?? { debit: 0, credit: 0 };
      priorNet += c.debit - c.credit - (p.debit - p.credit);
    }
    if (priorNet !== 0) {
      rows.push({
        account: { id: "__retained_earnings_prior__", code: "3090", name: "Retained Earnings (prior periods)", type: "EQUITY" },
        debit: priorNet > 0 ? priorNet : 0,
        credit: priorNet < 0 ? -priorNet : 0,
        synthetic: true,
      });
      rows.sort((a, b) => (a.account.code ?? a.account.name).localeCompare(b.account.code ?? b.account.name));
    }
  }
  return {
    rows,
    totalDebit: rows.reduce((s, r) => s + r.debit, 0),
    totalCredit: rows.reduce((s, r) => s + r.credit, 0),
  };
}

export type TaxGroup = {
  taxLine: string;
  total: number;
  accounts: { account: Account; amount: number }[];
};

export async function taxSummary(businessId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId, type: { in: ["INCOME", "EXPENSE"] } } }),
    getBalances(businessId, { from, to }),
  ]);
  const group = (type: string): TaxGroup[] => {
    const groups = new Map<string, TaxGroup>();
    for (const account of accounts.filter((a) => a.type === type)) {
      const raw = balances.get(account.id) ?? { debit: 0, credit: 0 };
      const amount = signedBalance(type, raw.debit, raw.credit);
      if (amount === 0) continue;
      const key = account.taxLine ?? "Unmapped — review with your accountant";
      const g = groups.get(key) ?? { taxLine: key, total: 0, accounts: [] };
      g.total += amount;
      g.accounts.push({ account, amount });
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.taxLine.localeCompare(b.taxLine));
  };
  const incomeGroups = group("INCOME");
  const expenseGroups = group("EXPENSE");
  const totalIncome = incomeGroups.reduce((s, g) => s + g.total, 0);
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.total, 0);
  return { year, from, to, incomeGroups, expenseGroups, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}
