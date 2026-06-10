import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { trialBalance } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput } from "../../../lib/money";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const from = sp.from ? parseDate(sp.from) : undefined;
  const to = sp.to ? parseDate(sp.to) : undefined;
  const report = await trialBalance(business.id, from, to);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Trial Balance</h1>
          <p className="text-sm text-zinc-500">{business.name}</p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=trial-balance${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">From (optional)</label>
          <input type="date" name="from" defaultValue={from ? toDateInput(from) : ""} className="input" />
        </div>
        <div>
          <label className="label">To (optional)</label>
          <input type="date" name="to" defaultValue={to ? toDateInput(to) : ""} className="input" />
        </div>
        <button className="btn">Run report</button>
      </form>

      <div className="card p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Account</th>
              <th className="th text-right">Debit</th>
              <th className="th text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.account.id}>
                <td className="td">
                  {row.account.code && (
                    <span className="mr-2 font-mono text-xs text-zinc-400">{row.account.code}</span>
                  )}
                  {row.account.name}
                </td>
                <td className="td text-right font-mono">{row.debit ? formatMoney(row.debit) : ""}</td>
                <td className="td text-right font-mono">{row.credit ? formatMoney(row.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <td className="td font-bold">Totals</td>
              <td className="td text-right font-mono font-bold">{formatMoney(report.totalDebit)}</td>
              <td className="td text-right font-mono font-bold">{formatMoney(report.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={`text-sm ${report.totalDebit === report.totalCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {report.totalDebit === report.totalCredit
          ? "✓ Debits equal credits — the books are in balance."
          : "⚠ Debits do not equal credits."}
      </p>
    </div>
  );
}
