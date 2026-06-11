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
  opts: { from?: Date; to?: Date } = {}
): Promise<Map<string, RawBalance>> {
  const lines = await prisma.journalLine.findMany({
    where: {
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

export async function profitAndLoss(businessId: string, from: Date | undefined, to: Date) {
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId, type: { in: ["INCOME", "EXPENSE"] } } }),
    getBalances(businessId, { from, to }),
  ]);
  const income = buildTree(accounts.filter((a) => a.type === "INCOME"), balances);
  const expenses = buildTree(accounts.filter((a) => a.type === "EXPENSE"), balances);
  const totalIncome = sumTree(income);
  const totalExpenses = sumTree(expenses);
  return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
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

export async function trialBalance(businessId: string, from?: Date, to?: Date) {
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId }, orderBy: { code: "asc" } }),
    getBalances(businessId, { from, to }),
  ]);
  const rows = accounts
    .map((account) => {
      const raw = balances.get(account.id) ?? { debit: 0, credit: 0 };
      const net = raw.debit - raw.credit;
      return {
        account,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
      };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
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
