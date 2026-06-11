import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { balanceSheet } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC, formatDate } from "../../../lib/money";
import { ReportTreeRows } from "../../../components/ReportTree";

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const asOf = sp.asOf ? parseDate(sp.asOf) : todayUTC();
  const report = await balanceSheet(business.id, asOf);
  const balanced = report.totalAssets === report.totalLiabilities + report.totalEquity;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Balance Sheet</h1>
          <p className="text-sm text-zinc-500">
            {business.name} · as of {formatDate(asOf)}
          </p>
        </div>
        <a className="btn btn-sm" href={`/api/export?report=balance-sheet&asOf=${toDateInput(asOf)}`}>
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">As of</label>
          <input type="date" name="asOf" defaultValue={toDateInput(asOf)} className="input" />
        </div>
        <button className="btn">Run report</button>
      </form>

      <div className="card p-0">
        <table className="w-full">
          <tbody>
            <tr>
              <td className="td font-semibold" colSpan={2}>
                Assets
              </td>
            </tr>
            <ReportTreeRows nodes={report.assets} drill={{ to: toDateInput(asOf) }} />
            <tr>
              <td className="td font-semibold">Total assets</td>
              <td className="td text-right font-mono font-semibold">{formatMoney(report.totalAssets)}</td>
            </tr>
            <tr>
              <td className="td pt-4 font-semibold" colSpan={2}>
                Liabilities
              </td>
            </tr>
            <ReportTreeRows nodes={report.liabilities} drill={{ to: toDateInput(asOf) }} />
            <tr>
              <td className="td font-semibold">Total liabilities</td>
              <td className="td text-right font-mono font-semibold">{formatMoney(report.totalLiabilities)}</td>
            </tr>
            <tr>
              <td className="td pt-4 font-semibold" colSpan={2}>
                Equity
              </td>
            </tr>
            <ReportTreeRows nodes={report.equity} drill={{ to: toDateInput(asOf) }} />
            <tr>
              <td className="td">
                <Link
                  href={`/reports/profit-loss?to=${toDateInput(asOf)}`}
                  className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                >
                  Net income (earnings to date)
                </Link>
              </td>
              <td className="td text-right font-mono">{formatMoney(report.netIncome)}</td>
            </tr>
            <tr>
              <td className="td font-semibold">Total equity</td>
              <td className="td text-right font-mono font-semibold">{formatMoney(report.totalEquity)}</td>
            </tr>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <td className="td font-bold">Liabilities + equity</td>
              <td className="td text-right font-mono font-bold">
                {formatMoney(report.totalLiabilities + report.totalEquity)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!balanced && (
        <p className="text-sm text-red-600 dark:text-red-400">
          ⚠ Assets do not equal liabilities + equity. Check for one-sided entries created
          outside Beanstalk.
        </p>
      )}
    </div>
  );
}
