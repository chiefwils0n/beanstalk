import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { ensureDefaultContactTypes, flattenContacts } from "../../lib/contacts";
import { createContact, deleteContact } from "../../lib/actions";
import { ConfirmButton } from "../../components/ConfirmButton";
import { ContactFields } from "../../components/ContactFields";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const business = await requireBusiness();
  await ensureDefaultContactTypes(business.id);
  const { type: typeFilter } = await searchParams;
  const [allContacts, types] = await Promise.all([
    prisma.contact.findMany({
      where: { businessId: business.id },
      include: { type: true, _count: { select: { invoices: true, lines: true, children: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.contactType.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);

  // Tree-ordered; when filtering by type, keep matches plus their parents for context.
  const filtered = typeFilter
    ? allContacts.filter(
        (c) =>
          c.typeId === typeFilter ||
          allContacts.some((child) => child.parentId === c.id && child.typeId === typeFilter)
      )
    : allContacts;
  const ordered = flattenContacts(filtered);
  const byId = new Map(allContacts.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Contacts</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        People and companies, in your own categories. Nest related contacts (tenants in a
        household, people at a company) and link any of them to transaction lines. Manage the
        type list in{" "}
        <Link href="/settings/contact-types" className="text-emerald-600 hover:underline">
          Settings → Contact types
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href="/contacts" className={`btn btn-sm ${!typeFilter ? "btn-primary" : ""}`}>
          All
        </Link>
        {types.map((type) => (
          <Link
            key={type.id}
            href={`/contacts?type=${type.id}`}
            className={`btn btn-sm ${typeFilter === type.id ? "btn-primary" : ""}`}
          >
            {type.name}
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
            {ordered.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={7}>
                  No contacts yet — add one below.
                </td>
              </tr>
            )}
            {ordered.map((row) => {
              const contact = byId.get(row.id)!;
              return (
                <tr key={contact.id}>
                  <td className="td">
                    <span style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
                      {row.depth > 0 && <span className="mr-1 text-zinc-400">└</span>}
                      <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                        {contact.name}
                      </Link>
                      {contact._count.children > 0 && (
                        <span className="ml-2 text-xs text-zinc-400">
                          {contact._count.children} nested
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="td">
                    {contact.type && (
                      <span className="badge bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        {contact.type.name.toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="td text-zinc-500">{contact.email ?? ""}</td>
                  <td className="td text-zinc-500">{contact.phone ?? ""}</td>
                  <td className="td text-right">{contact._count.invoices}</td>
                  <td className="td text-right">{contact._count.lines}</td>
                  <td className="td text-right">
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={contact.id} />
                      <ConfirmButton message={`Delete ${contact.name}? Linked transaction lines are kept; nested contacts move to top level.`}>
                        Delete
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">New contact</h2>
        <form action={createContact}>
          <ContactFields
            types={types}
            parents={allContacts.map((c) => ({ id: c.id, name: c.name }))}
          />
          <button className="btn btn-primary mt-4">Add contact</button>
        </form>
      </div>
    </div>
  );
}
