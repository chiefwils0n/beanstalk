import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { createContact, deleteContact } from "../../lib/actions";
import { ConfirmButton } from "../../components/ConfirmButton";
import { ContactFields } from "../../components/ContactFields";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const business = await requireBusiness();
  const { kind } = await searchParams;
  const contacts = await prisma.contact.findMany({
    where: { businessId: business.id, kind: kind || undefined },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { invoices: true, lines: true } } },
  });

  const tabs = [
    ["All", ""],
    ["Customers", "CUSTOMER"],
    ["Vendors", "VENDOR"],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Contacts</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Customers and vendors. Link a contact to any transaction line (the &ldquo;Name&rdquo;
        column) to track activity per person or company, and filter the General Ledger by name.
      </p>

      <div className="flex gap-2">
        {tabs.map(([label, value]) => (
          <Link
            key={label}
            href={value ? `/contacts?kind=${value}` : "/contacts"}
            className={`btn btn-sm ${(kind ?? "") === value ? "btn-primary" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Type</th>
              <th className="th">Email</th>
              <th className="th">Phone</th>
              <th className="th text-right">Invoices</th>
              <th className="th text-right">Lines</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={7}>
                  No contacts yet — add one below.
                </td>
              </tr>
            )}
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td className="td">
                  <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                    {contact.name}
                  </Link>
                  {(contact.firstName || contact.lastName) && contact.company && (
                    <span className="ml-2 text-xs text-zinc-400">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                    </span>
                  )}
                </td>
                <td className="td">
                  <span
                    className={`badge ${
                      contact.kind === "VENDOR"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    }`}
                  >
                    {contact.kind.toLowerCase()}
                  </span>
                </td>
                <td className="td text-zinc-500">{contact.email ?? ""}</td>
                <td className="td text-zinc-500">{contact.phone ?? ""}</td>
                <td className="td text-right">{contact._count.invoices}</td>
                <td className="td text-right">{contact._count.lines}</td>
                <td className="td text-right">
                  <form action={deleteContact}>
                    <input type="hidden" name="id" value={contact.id} />
                    <ConfirmButton message={`Delete ${contact.name}? Linked transaction lines are kept (the name is simply removed).`}>
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">New contact</h2>
        <form action={createContact}>
          <ContactFields />
          <button className="btn btn-primary mt-4">Add contact</button>
        </form>
      </div>
    </div>
  );
}
