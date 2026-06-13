import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { updateContact } from "../../../lib/actions";
import { formatMoney, formatDate } from "../../../lib/money";
import { ContactFields } from "../../../components/ContactFields";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { type: true, children: true, parent: true },
  });
  if (!contact) notFound();

  const [types, siblings, lines, invoices] = await Promise.all([
    prisma.contactType.findMany({ where: { businessId: contact.businessId }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ where: { businessId: contact.businessId }, orderBy: { name: "asc" } }),
    prisma.journalLine.findMany({
      where: { contactId: id, entry: { status: "POSTED" } },
      include: { entry: true, account: true },
      orderBy: { entry: { date: "desc" } },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: { customerId: id },
      orderBy: { issueDate: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/contacts" className="text-sm text-emerald-600 hover:underline">
          ← Contacts
        </Link>
        <h1 className="page-title mt-1">
          {contact.name}
          {contact.type && (
            <span className="badge ml-2 bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {contact.type.name.toLowerCase()}
            </span>
          )}
        </h1>
        {contact.parent && (
          <p className="text-sm text-zinc-500">
            Nested under{" "}
            <Link href={`/contacts/${contact.parent.id}`} className="text-emerald-600 hover:underline">
              {contact.parent.name}
            </Link>
          </p>
        )}
      </div>

      {contact.children.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Nested contacts</h2>
          <ul className="text-sm">
            {contact.children.map((child) => (
              <li key={child.id}>
                └{" "}
                <Link href={`/contacts/${child.id}`} className="text-emerald-600 hover:underline">
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">Details</h2>
        <form action={updateContact.bind(null, id)}>
          <ContactFields
            contact={contact}
            types={types}
            parents={siblings.map((s) => ({ id: s.id, name: s.name }))}
          />
          <button className="btn btn-primary mt-4">Save</button>
        </form>
      </div>

      {invoices.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Invoices</h2>
          <table className="w-full">
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="td">
                    <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="td text-zinc-500">{formatDate(invoice.issueDate)}</td>
                  <td className="td">
                    <span className="badge bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {invoice.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="td text-right money">{formatMoney(invoice.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">Ledger activity</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">No transaction lines linked to this contact.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Account</th>
                <th className="th">Memo</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(line.entry.date)}</td>
                  <td className="td">{line.account.name}</td>
                  <td className="td">
                    <Link href={`/transactions/${line.entryId}`} className="hover:underline">
                      {line.description || line.entry.memo}
                    </Link>
                  </td>
                  <td className="td text-right money">{line.debit ? formatMoney(line.debit) : ""}</td>
                  <td className="td text-right money">{line.credit ? formatMoney(line.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
