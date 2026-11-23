import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { cashFlowStatement } from "../../../lib/reports";
import type { CashFlowRow } from "../../../lib/cashFlow";
import { formatMoney, parseDate, toDateInput, todayUTC, formatDate } from "../../../lib/money";
import { resolvePeriod } from "../../../lib/periods";
import { ReportSectionHeader } from "../../../components/ReportSection";
import { ReportPeriodFields } from "../../../components/ReportPeriodFields";
import { ledgerHref } from "../../../components/ReportTree";

function Rows({ rows, drill }: { rows: CashFlowRow[]; drill: { from?: string; to: string } }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.accountId}>
          <td className="td pl-8">
            {row.code && <span className="mr-2 font-mono text-xs text-zinc-400">{row.code}</span>}
            <Link
              href={ledgerHref(row.accountId, drill)}
              className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
            >
              {row.name}
            </Link>
          </td>
          <td className="td text-right money">{formatMoney(row.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="total-row">
      <td className="td font-semibold">{label}</td>
      <td className="td text-right money font-semibold">{formatMoney(amount)}</td>
    </tr>
  );
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string; n?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const todayIso = toDateInput(today);
  const resolved = resolvePeriod(
    sp.period ?? (sp.from || sp.to ? "custom" : "this-year-to-date"),
    sp.from,
    sp.to,
    todayIso,
    business.fiscalYearStart,
    sp.n ? Number(sp.n) : undefined
  );
  const from = resolved.from ? parseDate(resolved.from) : undefined;
  const to = resolved.to ? parseDate(resolved.to) : today;
  const report = await cashFlowStatement(business.id, from, to);
  const drill = { from: from ? toDateInput(from) : undefined, to: toDateInput(to) };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
          ← Reports
        </Link>
        <h1 className="page-title mt-1">Cash Flow Statement</h1>
        <p className="text-sm text-zinc-500">
          {business.name} · {from ? `${formatDate(from)} – ` : "through "}
          {formatDate(to)}
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <ReportPeriodFields
          today={todayIso}
          fiscalStartMonth={business.fiscalYearStart}
          defaultPeriod={resolved.period}
          defaultFrom={from ? toDateInput(from) : ""}
          defaultTo={toDateInput(to)}
          defaultN={resolved.n}
        />
        <button className="btn">Run report</button>
      </form>

      {report.cashAccounts.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          No account is marked as cash yet. Open your bank accounts in the Chart of Accounts and set
          &ldquo;Cash flow statement&rdquo; to &ldquo;Cash &amp; bank&rdquo;.
        </p>
      )}

      <div className="card p-0">
        <table className="w-full">
          <tbody>
            <ReportSectionHeader label="Operating activities" tone="income" />
            <tr>
              <td className="td pl-8">
                <Link
                  href={`/reports/profit-loss?${from ? `from=${toDateInput(from)}&` : ""}to=${toDateInput(to)}`}
                  className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                >
                  Net income
                </Link>
              </td>
              <td className="td text-right money">{formatMoney(report.netIncome)}</td>
            </tr>
            <Rows rows={report.adjustments} drill={drill} />
            <Total label="Cash from operating activities" amount={report.operating} />

            <ReportSectionHeader label="Investing activities" tone="asset" gap />
            <Rows rows={report.investingRows} drill={drill} />
            <Total label="Cash from investing activities" amount={report.investing} />

            <ReportSectionHeader label="Financing activities" tone="liability" gap />
            <Rows rows={report.financingRows} drill={drill} />
            <Total label="Cash from financing activities" amount={report.financing} />

            <tr aria-hidden>
              <td colSpan={2} className="h-3" />
            </tr>
            <tr>
              <td className="td font-semibold">Net change in cash</td>
              <td className={`td text-right money font-semibold ${report.netChange < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatMoney(report.netChange)}
              </td>
            </tr>
            <tr>
              <td className="td">Cash at start of period</td>
              <td className="td text-right money">{formatMoney(report.cashStart)}</td>
            </tr>
            <tr className="grand-total-row">
              <td className="td font-bold">Cash at end of period</td>
              <td className="td text-right money font-bold">{formatMoney(report.cashEnd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {report.unexplained !== 0 && (
        <p className="text-sm text-red-600 dark:text-red-400">
          ⚠ The sections are off by {formatMoney(report.unexplained)} from the actual change in cash.
          Check for one-sided entries created outside Beanstalk.
        </p>
      )}

      <p className="text-xs text-zinc-400">
        Cash accounts:{" "}
        {report.cashAccounts.length > 0 ? report.cashAccounts.map((a) => a.name).join(", ") : "none"}. Other
        accounts are sorted into operating, investing or financing from their type and name — loans
        and equity are financing, equipment and property are investing. To change where an account
        appears, edit it in the Chart of Accounts. A positive amount is cash coming in.
      </p>
    </div>
  );
}
