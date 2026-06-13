import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { profitAndLoss } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { resolvePeriod } from "../../../lib/periods";
import { ReportTreeRows } from "../../../components/ReportTree";
import { ReportSectionHeader } from "../../../components/ReportSection";
import { ReportPeriodFields } from "../../../components/ReportPeriodFields";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; class?: string; period?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const todayIso = toDateInput(today);
  const resolved = resolvePeriod(sp.period, sp.from, sp.to, todayIso, business.fiscalYearStart);
  let from: Date | undefined;
  let to: Date;
  if (resolved.period !== "custom") {
    from = resolved.from ? parseDate(resolved.from) : undefined;
    to = resolved.to ? parseDate(resolved.to) : today;
  } else {
    // No explicit "from" alongside an explicit "to" (e.g. drilling from the
    // balance sheet's earnings-to-date) means all-time; else year-to-date.
    from = sp.from ? parseDate(sp.from) : sp.to ? undefined : new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    to = sp.to ? parseDate(sp.to) : today;
  }
  const fromIso = from ? toDateInput(from) : "";
  const toIso = toDateInput(to);
  const classId = sp.class || undefined;
  const [report, classes] = await Promise.all([
    profitAndLoss(business.id, from, to, classId),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);
  const activeClass = classes.find((c) => c.id === classId);
  const drill = { from: from ? toDateInput(from) : undefined, to: toDateInput(to), classId };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Profit &amp; Loss</h1>
          <p className="text-sm text-zinc-500">
            {business.name}
            {activeClass && ` · class: ${activeClass.name}`}
          </p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=profit-loss${from ? `&from=${toDateInput(from)}` : ""}&to=${toDateInput(to)}${classId ? `&class=${classId}` : ""}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <ReportPeriodFields
          today={todayIso}
          fiscalStartMonth={business.fiscalYearStart}
          defaultPeriod={resolved.period}
          defaultFrom={fromIso}
          defaultTo={toIso}
        />
        {classes.length > 0 && (
          <div>
            <label className="label">Class</label>
            <select name="class" defaultValue={classId ?? ""} className="input">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn">Run report</button>
      </form>

      <div className="card p-0">
        <table className="w-full">
          <tbody>
            <ReportSectionHeader label="Income" tone="income" />
            <ReportTreeRows nodes={report.income} drill={drill} />
            <tr>
              <td className="td font-semibold">Total income</td>
              <td className="td text-right money font-semibold">{formatMoney(report.totalIncome)}</td>
            </tr>
            <ReportSectionHeader label="Expenses" tone="expense" gap />
            <ReportTreeRows nodes={report.expenses} drill={drill} />
            <tr>
              <td className="td font-semibold">Total expenses</td>
              <td className="td text-right money font-semibold">{formatMoney(report.totalExpenses)}</td>
            </tr>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50">
              <td className="td text-base font-bold">Net income</td>
              <td className={`td text-right money text-base font-bold ${report.netIncome < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatMoney(report.netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
