import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { profitAndLoss } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { ReportTreeRows } from "../../../components/ReportTree";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  // No explicit "from" alongside an explicit "to" (e.g. drilling from the balance
  // sheet's earnings-to-date) means all-time; otherwise default to year-to-date.
  const from = sp.from ? parseDate(sp.from) : sp.to ? undefined : new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const to = sp.to ? parseDate(sp.to) : today;
  const report = await profitAndLoss(business.id, from, to);
  const drill = { from: from ? toDateInput(from) : undefined, to: toDateInput(to) };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Profit &amp; Loss</h1>
          <p className="text-sm text-zinc-500">{business.name}</p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=profit-loss${from ? `&from=${toDateInput(from)}` : ""}&to=${toDateInput(to)}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={from ? toDateInput(from) : ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={toDateInput(to)} className="input" />
        </div>
        <button className="btn">Run report</button>
      </form>

      <div className="card p-0">
        <table className="w-full">
          <tbody>
            <tr>
              <td className="td font-semibold" colSpan={2}>
                Income
              </td>
            </tr>
            <ReportTreeRows nodes={report.income} drill={drill} />
            <tr>
              <td className="td font-semibold">Total income</td>
              <td className="td text-right font-mono font-semibold">{formatMoney(report.totalIncome)}</td>
            </tr>
            <tr>
              <td className="td pt-4 font-semibold" colSpan={2}>
                Expenses
              </td>
            </tr>
            <ReportTreeRows nodes={report.expenses} drill={drill} />
            <tr>
              <td className="td font-semibold">Total expenses</td>
              <td className="td text-right font-mono font-semibold">{formatMoney(report.totalExpenses)}</td>
            </tr>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <td className="td text-base font-bold">Net income</td>
              <td className={`td text-right font-mono text-base font-bold ${report.netIncome < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatMoney(report.netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
