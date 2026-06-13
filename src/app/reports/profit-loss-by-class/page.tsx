import { Fragment } from "react";
import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { profitAndLossByClass, type ClassColumn, type ClassMatrixNode } from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { ReportSectionHeader } from "../../../components/ReportSection";

/** A money cell; blank for exactly zero to keep the matrix readable. */
function Amount({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td className={`td text-right money whitespace-nowrap ${bold ? "font-semibold" : ""}`}>
      {value === 0 ? "" : formatMoney(value)}
    </td>
  );
}

function MatrixRows({
  nodes,
  columns,
  depth = 0,
}: {
  nodes: ClassMatrixNode[];
  columns: ClassColumn[];
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isParent = node.children.length > 0;
        return (
          <Fragment key={node.account.id}>
            <tr className={node.account.isArchived ? "opacity-50" : ""}>
              <td className={`td whitespace-nowrap ${isParent ? "font-semibold" : ""}`}>
                <span style={{ paddingLeft: `${depth * 1.25}rem` }}>{node.account.name}</span>
              </td>
              {columns.map((col) => (
                <Amount key={col.key} value={node.values[col.key]} bold={isParent} />
              ))}
              <Amount value={node.total} bold />
            </tr>
            {isParent && (
              <MatrixRows nodes={node.children} columns={columns} depth={depth + 1} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function TotalRow({
  label,
  totals,
  columns,
  grand,
  tone,
}: {
  label: string;
  totals: Record<string, number>;
  columns: ClassColumn[];
  grand: number;
  tone?: "net";
}) {
  const net = tone === "net";
  return (
    <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
      <td className="td font-bold whitespace-nowrap">{label}</td>
      {columns.map((col) => (
        <td
          key={col.key}
          className={`td text-right money whitespace-nowrap font-bold ${
            net ? (totals[col.key] < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : ""
          }`}
        >
          {totals[col.key] === 0 ? "" : formatMoney(totals[col.key])}
        </td>
      ))}
      <td
        className={`td text-right money whitespace-nowrap font-bold ${
          net ? (grand < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : ""
        }`}
      >
        {formatMoney(grand)}
      </td>
    </tr>
  );
}

export default async function ProfitLossByClassPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const from = sp.from ? parseDate(sp.from) : sp.to ? undefined : new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const to = sp.to ? parseDate(sp.to) : today;
  const report = await profitAndLossByClass(business.id, from, to);
  const { columns } = report;
  // Account column + one per class + Total column.
  const totalCols = columns.length + 2;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">Profit &amp; Loss by Class</h1>
          <p className="text-sm text-zinc-500">{business.name}</p>
        </div>
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

      {columns.length === 0 ? (
        <div className="card text-sm text-zinc-500">No income or expense activity in this period.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Account</th>
                {columns.map((col) => (
                  <th key={col.key} className="th text-right whitespace-nowrap">
                    {col.name}
                  </th>
                ))}
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <ReportSectionHeader label="Income" tone="income" colSpan={totalCols} />
              <MatrixRows nodes={report.income} columns={columns} />
              <TotalRow label="Total income" totals={report.incomeTotals} columns={columns} grand={report.totalIncome} />

              <ReportSectionHeader label="Expenses" tone="expense" gap colSpan={totalCols} />
              <MatrixRows nodes={report.expenses} columns={columns} />
              <TotalRow label="Total expenses" totals={report.expenseTotals} columns={columns} grand={report.totalExpenses} />

              <tr aria-hidden>
                <td colSpan={totalCols} className="h-3" />
              </tr>
              <TotalRow label="Net income" totals={report.netTotals} columns={columns} grand={report.netIncome} tone="net" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
