import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { taxSummary } from "../../../lib/accounting";
import { formatMoney, todayUTC } from "../../../lib/money";
import type { TaxGroup } from "../../../lib/accounting";
import { ledgerHref } from "../../../components/ReportTree";

function TaxGroupRows({ groups, year }: { groups: TaxGroup[]; year: number }) {
  const drill = { from: `${year}-01-01`, to: `${year}-12-31` };
  return (
    <>
      {groups.map((group) => (
        <tbody key={group.taxLine}>
          <tr>
            <td className="td font-medium">{group.taxLine}</td>
            <td className="td text-right money font-medium">{formatMoney(group.total)}</td>
          </tr>
          {group.accounts.map(({ account, amount }) => (
            <tr key={account.id}>
              <td className="td pl-8 text-zinc-500">
                {account.code && <span className="mr-2 font-mono text-xs">{account.code}</span>}
                <Link
                  href={ledgerHref(account.id, drill)}
                  className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                >
                  {account.name}
                </Link>
              </td>
              <td className="td text-right money text-zinc-500">{formatMoney(amount)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </>
  );
}

export default async function TaxSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const currentYear = todayUTC().getUTCFullYear();
  const year = sp.year ? Number(sp.year) : currentYear - 1;
  const report = await taxSummary(business.id, year);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Tax Summary — {year}</h1>
          <p className="text-sm text-zinc-500">
            {business.name}
            {business.taxId && ` · EIN ${business.taxId}`} · grouped by tax line for your
            accountant
          </p>
        </div>
        <a className="btn btn-sm" href={`/api/export?report=tax-summary&year=${year}`}>
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">Tax year</label>
          <select name="year" defaultValue={String(year)} className="input">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button className="btn">Run report</button>
      </form>

      <div className="card p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Income</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <TaxGroupRows groups={report.incomeGroups} year={year} />
          <tbody>
            <tr className="total-row">
              <td className="td font-bold">Total income</td>
              <td className="td text-right money font-bold">{formatMoney(report.totalIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Deductions / Expenses</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <TaxGroupRows groups={report.expenseGroups} year={year} />
          <tbody>
            <tr className="total-row">
              <td className="td font-bold">Total expenses</td>
              <td className="td text-right money font-bold">{formatMoney(report.totalExpenses)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card flex items-center justify-between">
        <span className="font-semibold">Net profit for {year}</span>
        <span className={`money text-lg font-bold ${report.netProfit < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {formatMoney(report.netProfit)}
        </span>
      </div>

      <p className="text-xs text-zinc-400">
        Tax lines come from each account&apos;s &ldquo;tax line&rdquo; field (defaults follow IRS
        Schedule C). This summary is a bookkeeping deliverable for your tax preparer, not tax
        advice.
      </p>
    </div>
  );
}
