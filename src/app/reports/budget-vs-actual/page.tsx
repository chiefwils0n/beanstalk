import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { budgetVsActual } from "../../../lib/reports";
import { formatYearMonth, monthsBetween, parseYearMonth, type BudgetRow } from "../../../lib/budget";
import { formatMoney, formatDate, toDateInput, todayUTC } from "../../../lib/money";
import { ReportSectionHeader } from "../../../components/ReportSection";
import { ledgerHref } from "../../../components/ReportTree";

function Cells({ row, bold = false }: { row: BudgetRow; bold?: boolean }) {
  const weight = bold ? "font-semibold" : "";
  const tone =
    row.variance === 0 || row.budget === 0
      ? ""
      : row.favorable
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return (
    <>
      <td className={`td text-right money ${weight}`}>{formatMoney(row.actual)}</td>
      <td className={`td text-right money ${weight}`}>{row.budget ? formatMoney(row.budget) : "—"}</td>
      <td className={`td text-right money ${weight} ${tone}`}>{row.budget ? formatMoney(row.variance) : "—"}</td>
      <td className={`td text-right ${weight} ${tone}`}>{row.percent === null ? "—" : `${row.percent}%`}</td>
    </>
  );
}

export default async function BudgetVsActualPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const thisMonth = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const to = parseYearMonth(sp.to) ?? thisMonth;
  const from = parseYearMonth(sp.from) ?? { year: to.year, month: 1 };
  const months = monthsBetween(from, to);
  const report = await budgetVsActual(business.id, months);
  const drill = report ? { from: toDateInput(report.from), to: toDateInput(report.to) } : undefined;

  const rows = (list: BudgetRow[]) =>
    list.map((row) => (
      <tr key={row.account.id}>
        <td className="td pl-8">
          {row.account.code && <span className="mr-2 font-mono text-xs text-zinc-400">{row.account.code}</span>}
          <Link
            href={ledgerHref(row.account.id, drill)}
            className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
          >
            {row.account.name}
          </Link>
        </td>
        <Cells row={row} />
      </tr>
    ));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Budget vs. Actual</h1>
          <p className="text-sm text-zinc-500">
            {business.name}
            {report && ` · ${formatDate(report.from)} – ${formatDate(report.to)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="btn btn-sm"
            href={`/api/export?report=budget-vs-actual&from=${formatYearMonth(from)}&to=${formatYearMonth(to)}`}
          >
            Export CSV
          </a>
          <Link href={`/settings/budget?year=${to.year}`} className="btn btn-sm">
            Edit budget
          </Link>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">From month</label>
          <input type="month" name="from" defaultValue={formatYearMonth(from)} className="input" />
        </div>
        <div>
          <label className="label">To month</label>
          <input type="month" name="to" defaultValue={formatYearMonth(to)} className="input" />
        </div>
        <button className="btn">Run report</button>
      </form>

      {!report ? (
        <p className="text-sm text-red-600 dark:text-red-400">The &ldquo;from&rdquo; month is after the &ldquo;to&rdquo; month.</p>
      ) : (
        <>
          {!report.hasBudget && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              No budget is set for these months yet —{" "}
              <Link href={`/settings/budget?year=${to.year}`} className="underline">
                set one up
              </Link>
              .
            </p>
          )}
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Account</th>
                  <th className="th text-right">Actual</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">Over / (under)</th>
                  <th className="th text-right">% of budget</th>
                </tr>
              </thead>
              <tbody>
                <ReportSectionHeader label="Income" tone="income" colSpan={5} />
                {rows(report.income)}
                <tr className="total-row">
                  <td className="td font-semibold">Total income</td>
                  <Cells row={report.totalIncome} bold />
                </tr>
                <ReportSectionHeader label="Expenses" tone="expense" gap colSpan={5} />
                {rows(report.expenses)}
                <tr className="total-row">
                  <td className="td font-semibold">Total expenses</td>
                  <Cells row={report.totalExpenses} bold />
                </tr>
                <tr className="grand-total-row">
                  <td className="td font-bold">Net income</td>
                  <Cells row={report.net} bold />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400">
            &ldquo;Over / (under)&rdquo; is actual minus budget. Green is good news — income at or above
            budget, expenses at or below — and red is the opposite. Accounts with neither a budget
            nor activity are left out.
          </p>
        </>
      )}
    </div>
  );
}
