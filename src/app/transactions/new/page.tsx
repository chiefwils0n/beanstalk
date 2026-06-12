import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { toDateInput, todayUTC } from "../../../lib/money";
import { EntryForm } from "../../../components/EntryForm";

export default async function NewTransactionPage() {
  const business = await requireBusiness();
  const [accounts, tags, classes] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
    prisma.tag.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">New transaction</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Debits must equal credits. Debit increases assets and expenses; credit increases
        liabilities, equity, and income.
      </p>
      <EntryForm
        accounts={flattenAccounts(accounts)}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        defaultDate={toDateInput(todayUTC())}
      />
    </div>
  );
}
