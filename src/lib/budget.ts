/**
 * Budget vs. actual, as pure functions. A budget is a monthly amount per income
 * or expense account; the report compares the budget for a run of months with
 * what actually posted. Amounts are integer cents, signed the normal way for
 * the account type (income and expenses both positive).
 */

export type YearMonth = { year: number; month: number }; // month 1-12

const YM = /^(\d{4})-(\d{2})$/;

export function parseYearMonth(value: string | undefined): YearMonth | null {
  const m = YM.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Every month from `from` to `to` inclusive (empty if out of order; capped at 10 years). */
export function monthsBetween(from: YearMonth, to: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  let abs = from.year * 12 + (from.month - 1);
  const end = to.year * 12 + (to.month - 1);
  for (; abs <= end && out.length < 120; abs++) {
    out.push({ year: Math.floor(abs / 12), month: (abs % 12) + 1 });
  }
  return out;
}

export type BudgetAccount = { id: string; name: string; code: string | null; type: string };
export type BudgetRow = {
  account: BudgetAccount;
  actual: number;
  budget: number;
  /** actual − budget */
  variance: number;
  /** actual as a percentage of budget; null when there is no budget. */
  percent: number | null;
  /** Good news: income at or over budget, expenses at or under. */
  favorable: boolean;
};

function row(account: BudgetAccount, actual: number, budget: number): BudgetRow {
  const variance = actual - budget;
  return {
    account,
    actual,
    budget,
    variance,
    percent: budget !== 0 ? Math.round((actual / budget) * 1000) / 10 : null,
    favorable: account.type === "INCOME" ? variance >= 0 : variance <= 0,
  };
}

/** Rows for every account with a budget or activity, plus section and net totals. */
export function budgetReport(
  accounts: BudgetAccount[],
  actual: Map<string, number>,
  budget: Map<string, number>
) {
  const build = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => row(a, actual.get(a.id) ?? 0, budget.get(a.id) ?? 0))
      .filter((r) => r.actual !== 0 || r.budget !== 0)
      .sort((a, b) => (a.account.code ?? a.account.name).localeCompare(b.account.code ?? b.account.name));
  const income = build("INCOME");
  const expenses = build("EXPENSE");
  const total = (rows: BudgetRow[], type: string, name: string) =>
    row(
      { id: `__total_${type}`, name, code: null, type },
      rows.reduce((s, r) => s + r.actual, 0),
      rows.reduce((s, r) => s + r.budget, 0)
    );
  const totalIncome = total(income, "INCOME", "Total income");
  const totalExpenses = total(expenses, "EXPENSE", "Total expenses");
  const net = row(
    { id: "__net", name: "Net income", code: null, type: "INCOME" },
    totalIncome.actual - totalExpenses.actual,
    totalIncome.budget - totalExpenses.budget
  );
  return { income, expenses, totalIncome, totalExpenses, net };
}
