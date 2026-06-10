import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import {
  toggleRecurring,
  deleteRecurring,
  postRecurringNow,
  runAllDueRecurring,
} from "../../lib/actions";
import { formatMoney, formatDate, todayUTC } from "../../lib/money";
import { FREQUENCY_LABELS, type Frequency } from "../../lib/types";
import { ConfirmButton } from "../../components/ConfirmButton";

export default async function RecurringPage() {
  const business = await requireBusiness();
  const today = todayUTC();
  const recurring = await prisma.recurringTransaction.findMany({
    where: { businessId: business.id },
    include: { lines: true, _count: { select: { entries: true } } },
    orderBy: { nextRun: "asc" },
  });
  const dueCount = recurring.filter((r) => r.isActive && r.nextRun <= today).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Recurring transactions</h1>
        <div className="flex gap-2">
          {dueCount > 0 && (
            <form action={runAllDueRecurring}>
              <button className="btn">Post all due ({dueCount})</button>
            </form>
          )}
          <Link href="/recurring/new" className="btn btn-primary">
            + New recurring
          </Link>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Schedule</th>
              <th className="th">Next run</th>
              <th className="th text-right">Amount</th>
              <th className="th text-right">Posted</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {recurring.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={6}>
                  No recurring transactions. Set up rent, subscriptions, loan payments, or any
                  entry that repeats on a schedule.
                </td>
              </tr>
            )}
            {recurring.map((r) => {
              const due = r.isActive && r.nextRun <= today;
              const amount = r.lines.reduce((s, l) => s + l.debit, 0);
              return (
                <tr key={r.id} className={!r.isActive ? "opacity-50" : ""}>
                  <td className="td">
                    <span className="font-medium">{r.name}</span>
                    {!r.isActive && (
                      <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        paused
                      </span>
                    )}
                    {!r.autoPost && r.isActive && (
                      <span className="badge ml-2 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        manual
                      </span>
                    )}
                  </td>
                  <td className="td text-zinc-500">
                    every {r.interval > 1 ? `${r.interval} ` : ""}
                    {FREQUENCY_LABELS[r.frequency as Frequency]}
                    {r.endDate && ` until ${formatDate(r.endDate)}`}
                  </td>
                  <td className={`td whitespace-nowrap ${due ? "font-medium text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                    {formatDate(r.nextRun)}
                    {due && " (due)"}
                  </td>
                  <td className="td text-right font-mono">{formatMoney(amount)}</td>
                  <td className="td text-right">{r._count.entries}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      {r.isActive && (
                        <form action={postRecurringNow}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-sm">Post now</button>
                        </form>
                      )}
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-sm">{r.isActive ? "Pause" : "Resume"}</button>
                      </form>
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton message={`Delete recurring transaction "${r.name}"? Already-posted entries are kept.`}>
                          Delete
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
