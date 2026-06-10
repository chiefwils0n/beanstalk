import { prisma } from "../../lib/db";
import { getActiveBusiness } from "../../lib/business";
import { createBusiness, deleteBusiness, switchBusiness } from "../../lib/actions";
import { ConfirmButton } from "../../components/ConfirmButton";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function BusinessesPage() {
  const [businesses, active] = await Promise.all([
    prisma.business.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { entries: true, accounts: true, invoices: true } } },
    }),
    getActiveBusiness(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Businesses</h1>

      {businesses.length === 0 && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
          Welcome to Beanstalk! Create your first business below — a standard chart of accounts
          will be set up for you automatically.
        </div>
      )}

      {businesses.map((business) => (
        <div key={business.id} className="card flex items-center justify-between">
          <div>
            <p className="font-semibold">
              {business.name}
              {business.id === active?.id && (
                <span className="badge ml-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  active
                </span>
              )}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {business.legalName && <>{business.legalName} · </>}
              {business.taxId && <>EIN {business.taxId} · </>}
              Fiscal year starts {MONTHS[business.fiscalYearStart - 1]} ·{" "}
              {business._count.accounts} accounts · {business._count.entries} entries ·{" "}
              {business._count.invoices} invoices
            </p>
          </div>
          <div className="flex gap-2">
            {business.id !== active?.id && (
              <form action={switchBusiness.bind(null, business.id)}>
                <button className="btn btn-sm">Switch to</button>
              </form>
            )}
            <form action={deleteBusiness}>
              <input type="hidden" name="id" value={business.id} />
              <ConfirmButton message={`Delete ${business.name} and ALL of its data? This cannot be undone.`}>
                Delete
              </ConfirmButton>
            </form>
          </div>
        </div>
      ))}

      <div className="card">
        <h2 className="mb-3 font-semibold">New business</h2>
        <form action={createBusiness} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input name="name" required className="input" placeholder="Acme LLC" />
          </div>
          <div>
            <label className="label">Legal name</label>
            <input name="legalName" className="input" />
          </div>
          <div>
            <label className="label">Tax ID / EIN</label>
            <input name="taxId" className="input" />
          </div>
          <div>
            <label className="label">Fiscal year starts</label>
            <select name="fiscalYearStart" className="input" defaultValue="1">
              {MONTHS.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Create business</button>
          </div>
        </form>
      </div>
    </div>
  );
}
