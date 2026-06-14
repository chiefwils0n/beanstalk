import Link from "next/link";
import Image from "next/image";
import { prisma } from "../lib/db";
import { requireBusiness } from "../lib/business";
import { profitAndLoss, balanceSheet } from "../lib/accounting";
import { countDueRecurring } from "../lib/recurring";
import { runAllDueRecurring } from "../lib/actions";
import { formatMoney, formatDate, todayUTC } from "../lib/money";

export default async function Dashboard() {
  const business = await requireBusiness();
  const today = todayUTC();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const [mtd, ytd, bs, dueRecurring, recentEntries, openInvoices] = await Promise.all([
    profitAndLoss(business.id, monthStart, today),
    profitAndLoss(business.id, yearStart, today),
    balanceSheet(business.id, today),
    countDueRecurring(business.id),
    prisma.journalEntry.findMany({
      where: { businessId: business.id, status: "POSTED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { lines: true, tags: { include: { tag: true } } },
    }),
    prisma.invoice.findMany({
      where: { businessId: business.id, status: "SENT" },
      include: { customer: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  const cards = [
    { label: "Income (MTD)", value: mtd.totalIncome, tone: "emerald", icon: "income" },
    { label: "Expenses (MTD)", value: mtd.totalExpenses, tone: "rose", icon: "expense" },
    { label: "Net income (YTD)", value: ytd.netIncome, tone: "sky", icon: "income" },
    { label: "Total assets", value: bs.totalAssets, tone: "indigo", icon: "asset" },
    { label: "Total liabilities", value: bs.totalLiabilities, tone: "amber", icon: "liability" },
  ];

  // Colored tint + left accent per tone; text stays neutral (black/white) for
  // readability, matching the Chart of Accounts and report headers.
  const labelText = "text-zinc-600 dark:text-zinc-400";
  const valueText = "text-zinc-900 dark:text-zinc-100";
  const toneStyles: Record<string, { wrap: string; label: string; value: string }> = {
    emerald: { wrap: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40", label: labelText, value: valueText },
    rose: { wrap: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/40", label: labelText, value: valueText },
    sky: { wrap: "border-l-sky-500 bg-sky-50 dark:bg-sky-950/40", label: labelText, value: valueText },
    indigo: { wrap: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/40", label: labelText, value: valueText },
    amber: { wrap: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40", label: labelText, value: valueText },
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{business.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatDate(today)}</p>
        </div>
        <Link href="/transactions/new" className="btn btn-primary">
          + New transaction
        </Link>
      </div>

      {dueRecurring > 0 && (
        <form
          action={runAllDueRecurring}
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950"
        >
          <span>
            {dueRecurring} recurring transaction{dueRecurring > 1 ? "s are" : " is"} due.
          </span>
          <button className="btn btn-sm">Post now</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((card) => {
          const t = toneStyles[card.tone];
          return (
            <div
              key={card.label}
              className={`flex items-center gap-2 rounded-xl border-l-4 p-4 shadow-sm ${t.wrap}`}
            >
              <Image
                src={`/icons/${card.icon}.png`}
                alt=""
                width={32}
                height={31}
                className="shrink-0"
              />
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${t.label}`}>
                  {card.label}
                </p>
                <p className={`mt-0.5 money whitespace-nowrap text-lg font-bold tracking-tight ${t.value}`}>
                  {formatMoney(card.value)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent transactions</h2>
            <Link href="/transactions" className="text-sm text-emerald-600 hover:underline">
              View all
            </Link>
          </div>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">No transactions yet.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {recentEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="td whitespace-nowrap text-zinc-500">{formatDate(entry.date)}</td>
                    <td className="td">
                      <Link href={`/transactions/${entry.id}`} className="hover:underline">
                        {entry.memo}
                      </Link>
                      {entry.tags.map(({ tag }) => (
                        <span
                          key={tag.id}
                          className="badge ml-1.5 text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </td>
                    <td className="td text-right money">
                      {formatMoney(entry.lines.reduce((s, l) => s + l.debit, 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Open invoices</h2>
            <Link href="/invoices" className="text-sm text-emerald-600 hover:underline">
              View all
            </Link>
          </div>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-zinc-500">No open invoices.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {openInvoices.map((invoice) => {
                  const overdue = invoice.dueDate < today;
                  return (
                    <tr key={invoice.id}>
                      <td className="td">
                        <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="td">{invoice.customer.name}</td>
                      <td className={`td whitespace-nowrap ${overdue ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                        due {formatDate(invoice.dueDate)}
                      </td>
                      <td className="td text-right money">{formatMoney(invoice.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
