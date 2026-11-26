import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { ensureDefaultContactTypes } from "../../../lib/contacts";
import { createContact } from "../../../lib/actions";
import { ContactFields } from "../../../components/ContactFields";

export default async function NewContactPage() {
  const business = await requireBusiness();
  await ensureDefaultContactTypes(business.id);
  const [contacts, types] = await Promise.all([
    prisma.contact.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contactType.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/contacts" className="text-sm text-emerald-600 hover:underline">
          ← Contacts
        </Link>
        <h1 className="page-title mt-1">New contact</h1>
      </div>
      <div className="card">
        <form action={createContact}>
          <ContactFields types={types} parents={contacts} />
          <div className="mt-4 flex items-center gap-2">
            <button className="btn btn-primary">Add contact</button>
            <Link href="/contacts" className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
