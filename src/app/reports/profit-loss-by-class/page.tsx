import { Fragment } from "react";
import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import {
  profitAndLossByClass,
  UNCLASSIFIED_KEY,
  type ClassColumn,
  type ClassMatrixNode,
} from "../../../lib/accounting";
import { formatMoney, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { resolvePeriod } from "../../../lib/periods";
import { ReportSectionHeader } from "../../../components/ReportSection";
import { ReportPeriodFields } from "../../../components/ReportPeriodFields";
import { ledgerHref, type DrillRange } from "../../../components/ReportTree";

/** A plain (non-drillable) money cell; blank for exactly zero. */
function Amount({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td className={`td text-right money whitespace-nowrap ${bold ? "font-semibold" : ""}`}>
      {value === 0 ? "" : formatMoney(value)}
    </td>
  );
}

/**
 * A drillable amount cell. `classId` is the column's class (or undefined for the
 * Total column / "none" for Unclassified) — clicking opens the General Ledger
 * filtered to this account + class + period, from which you can reach the entry.
 */
function DrillAmount({
  value,
  accountId,
  drill,
  classId,
  bold,
}: {
  value: number;
  accountId: string;
  drill: DrillRange;
  classId?: string;
  bold?: boolean;
}) {
  return (
    <td className={`td text-right money whitespace-nowrap ${bold ? "font-semibold" : ""}`}>
      {value === 0 ? (
        ""
      ) : (
        <Link
          href={ledgerHref(accountId, { ...drill, classId })}
          className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
        >
          {formatMoney(value)}
        </Link>
      )}
    </td>
  );
}

function MatrixRows({
  nodes,
  columns,
  drill,
  depth = 0,
}: {
  nodes: ClassMatrixNode[];
  columns: ClassColumn[];
  drill: DrillRange;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isParent = node.children.length > 0;
        // Each row shows the account's own (direct) postings — drillable to that
        // account + class. Parents then get a rolled-up "Total <name>" row after
        // their children (a subtotal across the subtree, not one ledger query).
        const ownTotal = columns.reduce((s, c) => s + node.own[c.key], 0);
        return (
          <Fragment key={node.account.id}>
            <tr className={node.account.isArchived ? "opacity-50" : ""}>
              <td className={`td whitespace-nowrap ${isParent ? "font-semibold" : ""}`}>
                <span style={{ paddingLeft: `${depth * 1.25}rem` }}>{node.account.name}</span>
              </td>
              {columns.map((col) => (
                <DrillAmount
                  key={col.key}
                  value={node.own[col.key]}
                  accountId={node.account.id}
                  drill={drill}
                  classId={col.key === UNCLASSIFIED_KEY ? "none" : col.key}
                  bold={isParent}
                />
              ))}
              <DrillAmount value={ownTotal} accountId={node.account.id} drill={drill} bold={isParent} />
            </tr>
            {isParent && (
              <>
                <MatrixRows nodes={node.children} columns={columns} drill={drill} depth={depth + 1} />
                <tr>
                  <td className="td whitespace-nowrap text-sm font-medium text-zinc-500">
                    <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
                      Total {node.account.name}
                    </span>
                  </td>
                  {columns.map((col) => (
                    <Amount key={col.key} value={node.values[col.key]} bold />
                  ))}
                  <Amount value={node.total} bold />
                </tr>
              </>
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
  searchParams: Promise<{ from?: string; to?: string; period?: string; n?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const todayIso = toDateInput(today);
  const resolved = resolvePeriod(sp.period, sp.from, sp.to, todayIso, business.fiscalYearStart, sp.n ? Number(sp.n) : undefined);
  let from: Date | undefined;
  let to: Date;
  if (resolved.period !== "custom") {
    from = resolved.from ? parseDate(resolved.from) : undefined;
    to = resolved.to ? parseDate(resolved.to) : today;
  } else {
    from = sp.from ? parseDate(sp.from) : sp.to ? undefined : new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    to = sp.to ? parseDate(sp.to) : today;
  }
  const report = await profitAndLossByClass(business.id, from, to);
  const { columns } = report;
  // Account column + one per class + Total column.
  const totalCols = columns.length + 2;
  const drill: DrillRange = { from: from ? toDateInput(from) : undefined, to: toDateInput(to) };

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
              <MatrixRows nodes={report.income} columns={columns} drill={drill} />
              <TotalRow label="Total income" totals={report.incomeTotals} columns={columns} grand={report.totalIncome} />

              <ReportSectionHeader label="Expenses" tone="expense" gap colSpan={totalCols} />
              <MatrixRows nodes={report.expenses} columns={columns} drill={drill} />
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
