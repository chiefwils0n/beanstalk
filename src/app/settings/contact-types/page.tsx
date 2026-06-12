import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { ensureDefaultContactTypes } from "../../../lib/contacts";
import { createContactType, updateContactType, deleteContactType } from "../../../lib/actions";
import { ConfirmButton } from "../../../components/ConfirmButton";

export default async function ContactTypesPage() {
  const business = await requireBusiness();
  await ensureDefaultContactTypes(business.id);
  const types = await prisma.contactType.findMany({
    where: { businessId: business.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Categorize your contacts however your business works — Customer, Vendor, Tenant, Lead,
        Property Manager… Types drive the tabs and grouping on the Contacts page and in the
        per-line Name dropdowns.
      </p>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Type</th>
              <th className="th text-right">Contacts</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type.id}>
                <td className="td">
                  <form action={updateContactType} className="flex items-center gap-2" id={`ct-${type.id}`}>
                    <input type="hidden" name="id" value={type.id} />
                    <input name="name" defaultValue={type.name} className="input max-w-64" />
                  </form>
                </td>
                <td className="td text-right">{type._count.contacts}</td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm" form={`ct-${type.id}`}>
                      Save
                    </button>
                    <form action={deleteContactType}>
                      <input type="hidden" name="id" value={type.id} />
                      <ConfirmButton message={`Delete type "${type.name}"? Its contacts become untyped (no contact data is lost).`}>
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">New contact type</h2>
        <form action={createContactType} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="e.g. Tenant, Lead, Lender" />
          </div>
          <button className="btn btn-primary">Add type</button>
        </form>
      </div>
    </div>
  );
}
