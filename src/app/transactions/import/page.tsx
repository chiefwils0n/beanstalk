import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { ImportForm } from "../../../components/ImportForm";

export default async function ImportTransactionsPage() {
  const business = await requireBusiness();
  const accounts = await prisma.account.findMany({
    where: { businessId: business.id, isArchived: false },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Import transactions</h1>
        <Link href="/transactions" className="btn">
          Back to transactions
        </Link>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Upload a CSV export from a bank or card account. Each row becomes a balanced
        transaction between that account and the category you choose — or several
        categories, if you split it. Nothing is saved until you click Import.
      </p>
      <ImportForm
        accounts={flattenAccounts(accounts)}
        savedMappings={Object.fromEntries(
          accounts.filter((a) => a.importMapping).map((a) => [a.id, a.importMapping as string])
        )}
      />
    </div>
  );
}
