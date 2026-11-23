import Link from "next/link";
import { AGEING_BUCKETS, AGEING_LABELS, buildAgeing, type OpenDoc } from "../lib/ageing";
import { formatMoney, formatDate, toDateInput, todayUTC } from "../lib/money";
import { AsOfField } from "./AsOfField";

/** Shared layout for the receivables and payables ageing reports. */
export function AgeingReport({
  title,
  businessName,
  fiscalStartMonth,
  asOf,
  docs,
  docHref,
  contactLabel,
  emptyText,
}: {
  title: string;
  businessName: string;
  fiscalStartMonth: number;
  asOf: Date;
  docs: OpenDoc[];
  docHref: (id: string) => string;
  contactLabel: string;
  emptyText: string;
}) {
  const report = buildAgeing(docs, asOf);
  const money = (cents: number) => (cents ? formatMoney(cents) : "");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
          ← Reports
        </Link>
        <h1 className="page-title mt-1">{title}</h1>
        <p className="text-sm text-zinc-500">
          {businessName} · as of {formatDate(asOf)}
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <AsOfField today={toDateInput(todayUTC())} fiscalStartMonth={fiscalStartMonth} defaultAsOf={toDateInput(asOf)} />
        <button className="btn">Run report</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">{contactLabel}</th>
              <th className="th">Due</th>
              {AGEING_BUCKETS.map((bucket) => (
                <th key={bucket} className="th text-right">
                  {AGEING_LABELS[bucket]}
                </th>
              ))}
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          {report.groups.length === 0 && (
            <tbody>
              <tr>
                <td className="td text-zinc-500" colSpan={AGEING_BUCKETS.length + 3}>
                  {emptyText}
                </td>
              </tr>
            </tbody>
          )}
          {report.groups.map((group) => (
            <tbody key={group.contactId}>
              <tr>
                <td className="td font-medium" colSpan={2}>
                  <Link href={`/contacts/${group.contactId}`} className="hover:underline">
                    {group.contactName}
                  </Link>
                </td>
                {AGEING_BUCKETS.map((bucket) => (
                  <td key={bucket} className="td text-right money font-medium">
                    {money(group.totals[bucket])}
                  </td>
                ))}
                <td className="td text-right money font-medium">{formatMoney(group.total)}</td>
              </tr>
              {group.docs.map((doc) => (
                <tr key={doc.id}>
                  <td className="td pl-8 text-zinc-500">
                    <Link href={docHref(doc.id)} className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400">
                      {doc.label}
                    </Link>{" "}
                    <span className="text-xs">· {formatDate(doc.date)}</span>
                  </td>
                  <td className="td whitespace-nowrap text-zinc-500">
                    {formatDate(doc.dueDate)}
                    {doc.daysPastDue > 0 && <span className="text-xs"> · {doc.daysPastDue}d late</span>}
                  </td>
                  {AGEING_BUCKETS.map((bucket) => (
                    <td key={bucket} className="td text-right money text-zinc-500">
                      {doc.bucket === bucket ? formatMoney(doc.open) : ""}
                    </td>
                  ))}
                  <td className="td" />
                </tr>
              ))}
            </tbody>
          ))}
          {report.groups.length > 0 && (
            <tbody>
              <tr className="grand-total-row">
                <td className="td font-bold" colSpan={2}>
                  Total
                </td>
                {AGEING_BUCKETS.map((bucket) => (
                  <td key={bucket} className="td text-right money font-bold">
                    {money(report.totals[bucket])}
                  </td>
                ))}
                <td className="td text-right money font-bold">{formatMoney(report.total)}</td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
      <p className="text-xs text-zinc-400">
        Buckets count days past the due date on the as-of date. Payments dated after the as-of date
        are ignored, so the report shows what was outstanding on that day.
      </p>
    </div>
  );
}
