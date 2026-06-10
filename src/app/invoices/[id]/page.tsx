import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { sendInvoice, voidInvoice, deleteInvoice } from "../../../lib/actions";
import { formatMoney, formatDate, toDateInput, todayUTC } from "../../../lib/money";
import { PaymentForm } from "../../../components/PaymentForm";
import { ConfirmButton } from "../../../components/ConfirmButton";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { account: true } },
      documents: true,
      entries: {
        where: { status: "POSTED" },
        include: { lines: { include: { account: true } } },
        orderBy: { date: "asc" },
      },
    },
  });
  if (!invoice) notFound();

  const receivable = await prisma.account.findFirst({
    where: { businessId: invoice.businessId, type: "ASSET", name: "Accounts Receivable" },
  });
  const paid = receivable
    ? invoice.entries.reduce(
        (sum, entry) =>
          sum +
          entry.lines
            .filter((l) => l.accountId === receivable.id)
            .reduce((s, l) => s + l.credit, 0),
        0
      )
    : 0;
  const balanceDue = invoice.total - paid;

  const cashAccounts = await prisma.account.findMany({
    where: { businessId: invoice.businessId, type: "ASSET", isArchived: false },
    orderBy: { code: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-emerald-600 hover:underline">
            ← Invoices
          </Link>
          <h1 className="page-title mt-1">
            {invoice.number}
            <span className="badge ml-2 bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {invoice.status.toLowerCase()}
            </span>
          </h1>
          <p className="text-sm text-zinc-500">
            {invoice.customer.name} · issued {formatDate(invoice.issueDate)} · due{" "}
            {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="flex gap-2">
          {invoice.status === "DRAFT" && (
            <form action={sendInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <button className="btn btn-primary btn-sm">Mark sent & post</button>
            </form>
          )}
          {(invoice.status === "SENT" || invoice.status === "PAID") && (
            <form action={voidInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <ConfirmButton message="Void this invoice and its ledger entries?" className="btn btn-sm">
                Void
              </ConfirmButton>
            </form>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "VOID") && (
            <form action={deleteInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <ConfirmButton message="Delete this invoice?">Delete</ConfirmButton>
            </form>
          )}
        </div>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Description</th>
              <th className="th">Income account</th>
              <th className="th text-right">Qty</th>
              <th className="th text-right">Unit price</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="td">{item.description}</td>
                <td className="td text-zinc-500">{item.account.name}</td>
                <td className="td text-right">{item.quantity}</td>
                <td className="td text-right font-mono">{formatMoney(item.unitPrice)}</td>
                <td className="td text-right font-mono">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="td font-semibold" colSpan={4}>
                Total
              </td>
              <td className="td text-right font-mono font-semibold">{formatMoney(invoice.total)}</td>
            </tr>
            <tr>
              <td className="td" colSpan={4}>
                Paid
              </td>
              <td className="td text-right font-mono">{formatMoney(paid)}</td>
            </tr>
            <tr>
              <td className="td font-semibold" colSpan={4}>
                Balance due
              </td>
              <td className="td text-right font-mono font-semibold">{formatMoney(balanceDue)}</td>
            </tr>
          </tfoot>
        </table>
        {invoice.notes && <p className="mt-3 text-sm text-zinc-500">{invoice.notes}</p>}
      </div>

      {invoice.status === "SENT" && balanceDue > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Record payment</h2>
          <PaymentForm
            invoiceId={invoice.id}
            accounts={cashAccounts
              .filter((a) => a.name !== "Accounts Receivable")
              .map((a) => ({ id: a.id, label: `${a.code ? a.code + " · " : ""}${a.name}` }))}
            defaultDate={toDateInput(todayUTC())}
            defaultAmount={(balanceDue / 100).toFixed(2)}
          />
        </div>
      )}

      {invoice.entries.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Ledger entries</h2>
          <table className="w-full">
            <tbody>
              {invoice.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(entry.date)}</td>
                  <td className="td">
                    <Link href={`/transactions/${entry.id}`} className="hover:underline">
                      {entry.memo}
                    </Link>
                  </td>
                  <td className="td text-right font-mono">
                    {formatMoney(entry.lines.reduce((s, l) => s + l.debit, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoice.documents.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Attached documents</h2>
          <ul className="text-sm">
            {invoice.documents.map((doc) => (
              <li key={doc.id}>
                📎{" "}
                {doc.webViewLink ? (
                  <a href={doc.webViewLink} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                    {doc.name}
                  </a>
                ) : (
                  doc.name
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
