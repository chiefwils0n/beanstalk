import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { updateBusiness, deleteBusiness } from "../../../../lib/actions";
import { ConfirmButton } from "../../../../components/ConfirmButton";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function EditBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: { _count: { select: { entries: true, accounts: true, invoices: true, contacts: true, loans: true } } },
  });
  if (!business) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings/businesses" className="text-sm text-emerald-600 hover:underline">
          ← Businesses
        </Link>
        <h2 className="mt-1 text-xl font-bold tracking-tight">{business.name}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {business._count.accounts} accounts · {business._count.entries} entries ·{" "}
          {business._count.invoices} invoices · {business._count.contacts} contacts ·{" "}
          {business._count.loans} loans
        </p>
      </div>

      <div className="card">
        <h3 className="mb-3 font-semibold">Business details</h3>
        <form action={updateBusiness.bind(null, id)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input name="name" required defaultValue={business.name} className="input" />
          </div>
          <div>
            <label className="label">Legal name</label>
            <input name="legalName" defaultValue={business.legalName ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Tax ID / EIN</label>
            <input name="taxId" defaultValue={business.taxId ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Fiscal year starts</label>
            <select name="fiscalYearStart" className="input" defaultValue={String(business.fiscalYearStart)}>
              {MONTHS.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Save changes</button>
          </div>
        </form>
      </div>

      <div className="card border-red-200 dark:border-red-900">
        <h3 className="mb-2 font-semibold">Danger zone</h3>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Deleting a business permanently removes its accounts, transactions, invoices,
          contacts, loans, and documents.
        </p>
        <form action={deleteBusiness}>
          <input type="hidden" name="id" value={business.id} />
          <ConfirmButton message={`Delete ${business.name} and ALL of its data? This cannot be undone.`}>
            Delete this business
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
