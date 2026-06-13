import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { trialBalance } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { resolvePeriod } from "../../../lib/periods";
import { ledgerHref } from "../../../components/ReportTree";
import { ReportPeriodFields } from "../../../components/ReportPeriodFields";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string; n?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const todayIso = toDateInput(todayUTC());
  const resolved = resolvePeriod(sp.period, sp.from, sp.to, todayIso, business.fiscalYearStart, sp.n ? Number(sp.n) : undefined);
  const from = resolved.from ? parseDate(resolved.from) : undefined;
  const to = resolved.to ? parseDate(resolved.to) : undefined;
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
        <ReportPeriodFields
          today={todayIso}
          fiscalStartMonth={business.fiscalYearStart}
          defaultPeriod={resolved.period}
          defaultFrom={from ? toDateInput(from) : ""}
          defaultTo={to ? toDateInput(to) : ""}
          defaultN={resolved.n}
        />
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
                  <Link
                    href={ledgerHref(row.account.id, { from: sp.from, to: sp.to })}
                    className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                  >
                    {row.account.name}
                  </Link>
                </td>
                <td className="td text-right money">{row.debit ? formatMoney(row.debit) : ""}</td>
                <td className="td text-right money">{row.credit ? formatMoney(row.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <td className="td font-bold">Totals</td>
              <td className="td text-right money font-bold">{formatMoney(report.totalDebit)}</td>
              <td className="td text-right money font-bold">{formatMoney(report.totalCredit)}</td>
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
