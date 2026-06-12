import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { toDateInput, todayUTC } from "../../../lib/money";
import { RecurringForm } from "../../../components/RecurringForm";

export default async function NewRecurringPage() {
  const business = await requireBusiness();
  const [accounts, classes, contacts] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">New recurring transaction</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        The lines below are posted as a journal entry on each scheduled date — e.g. rent: debit
        Rent &amp; Lease, credit Checking.
      </p>
      <RecurringForm
        accounts={flattenAccounts(accounts)}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        defaultDate={toDateInput(todayUTC())}
      />
    </div>
  );
}
