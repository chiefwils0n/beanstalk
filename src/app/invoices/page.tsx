import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { formatMoney, formatDate, todayUTC } from "../../lib/money";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  VOID: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

export default async function InvoicesPage() {
  const business = await requireBusiness();
  const today = todayUTC();
  const invoices = await prisma.invoice.findMany({
    where: { businessId: business.id },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Invoices</h1>
        <Link href="/invoices/new" className="btn btn-primary">
          + New invoice
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Number</th>
              <th className="th">Customer</th>
              <th className="th">Issued</th>
              <th className="th">Due</th>
              <th className="th text-right">Total</th>
              <th className="th text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={6}>
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((invoice) => {
              const overdue = invoice.status === "SENT" && invoice.dueDate < today;
              return (
                <tr key={invoice.id}>
                  <td className="td">
                    <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="td">{invoice.customer.name}</td>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(invoice.issueDate)}</td>
                  <td className={`td whitespace-nowrap ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                    {formatDate(invoice.dueDate)}
                    {overdue && " (overdue)"}
                  </td>
                  <td className="td text-right font-mono">{formatMoney(invoice.total)}</td>
                  <td className="td text-center">
                    <span className={`badge ${STATUS_STYLES[invoice.status]}`}>{invoice.status.toLowerCase()}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
