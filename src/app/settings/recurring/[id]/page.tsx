import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { flattenAccounts } from "../../../../lib/accounting";
import { flattenContacts } from "../../../../lib/contacts";
import { toDateInput, todayUTC, formatDate } from "../../../../lib/money";
import { RecurringForm } from "../../../../components/RecurringForm";
import type { Frequency } from "../../../../lib/types";

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recurring = await prisma.recurringTransaction.findUnique({
    where: { id },
    include: { lines: true, _count: { select: { entries: true } } },
  });
  if (!recurring) notFound();

  const [accounts, classes, contacts] = await Promise.all([
    prisma.account.findMany({ where: { businessId: recurring.businessId } }),
    prisma.class.findMany({ where: { businessId: recurring.businessId }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({
      where: { businessId: recurring.businessId },
      include: { type: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings/recurring" className="text-sm text-emerald-600 hover:underline">
          ← Recurring
        </Link>
        <h2 className="mt-1 text-xl font-bold tracking-tight">
          {recurring.name}
          {!recurring.isActive && (
            <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              paused
            </span>
          )}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {recurring._count.entries} entries posted
          {recurring.lastRun && ` · last run ${formatDate(recurring.lastRun)}`}
        </p>
      </div>

      <RecurringForm
        accounts={flattenAccounts(accounts)}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        contacts={flattenContacts(contacts)}
        defaultDate={toDateInput(todayUTC())}
        recurringId={recurring.id}
        initial={{
          name: recurring.name,
          memo: recurring.memo ?? "",
          frequency: recurring.frequency as Frequency,
          interval: String(recurring.interval),
          startDate: toDateInput(recurring.nextRun),
          endDate: recurring.endDate ? toDateInput(recurring.endDate) : "",
          autoPost: recurring.autoPost,
          lines: recurring.lines.map((line) => ({
            accountId: line.accountId,
            classId: line.classId ?? "",
            contactId: line.contactId ?? "",
            description: line.description ?? "",
            debit: line.debit ? (line.debit / 100).toFixed(2) : "",
            credit: line.credit ? (line.credit / 100).toFixed(2) : "",
          })),
        }}
      />
    </div>
  );
}
