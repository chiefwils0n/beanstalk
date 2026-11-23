import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { todayUTC } from "../../../lib/money";
import { BudgetGrid } from "../../../components/BudgetGrid";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const currentYear = todayUTC().getUTCFullYear();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : currentYear;
  const [accounts, budgets] = await Promise.all([
    prisma.account.findMany({
      where: { businessId: business.id, type: { in: ["INCOME", "EXPENSE"] }, isArchived: false },
    }),
    prisma.budget.findMany({ where: { businessId: business.id, year } }),
  ]);
  const initial: Record<string, string[]> = {};
  for (const b of budgets) {
    const row = (initial[b.accountId] ??= Array(12).fill(""));
    row[b.month - 1] = (b.amount / 100).toFixed(2);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Set a monthly budget for each income and expense account, then compare it with what
        actually happened in the{" "}
        <Link href="/reports/budget-vs-actual" className="underline">
          Budget vs. Actual
        </Link>{" "}
        report. Leave a month blank for no budget. &ldquo;Fill year&rdquo; copies the first amount
        in a row to every month.
      </p>
      <div className="flex items-center gap-2">
        <Link href={`/settings/budget?year=${year - 1}`} className="btn btn-sm">
          ← {year - 1}
        </Link>
        <span className="px-2 text-lg font-semibold">{year}</span>
        <Link href={`/settings/budget?year=${year + 1}`} className="btn btn-sm">
          {year + 1} →
        </Link>
      </div>
      <BudgetGrid
        key={year}
        year={year}
        accounts={flattenAccounts(accounts).map((a) => ({ id: a.id, label: a.label, type: a.type }))}
        initial={initial}
      />
    </div>
  );
}
