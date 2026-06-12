import { prisma } from "./db";
import { todayUTC } from "./money";

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function advanceDate(date: Date, frequency: string, interval: number): Date {
  const d = new Date(date);
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + interval);
      break;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7 * interval);
      break;
    case "MONTHLY": {
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + interval);
      d.setUTCDate(Math.min(day, lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth())));
      break;
    }
    case "YEARLY": {
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      d.setUTCDate(Math.min(day, lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth())));
      break;
    }
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  return d;
}

/** Post one occurrence of a recurring transaction on the given date. */
export async function postOccurrence(recurringId: string, date: Date) {
  const recurring = await prisma.recurringTransaction.findUniqueOrThrow({
    where: { id: recurringId },
    include: { lines: true },
  });
  return prisma.journalEntry.create({
    data: {
      businessId: recurring.businessId,
      date,
      memo: recurring.memo || recurring.name,
      recurringId: recurring.id,
      lines: {
        create: recurring.lines.map((line) => ({
          accountId: line.accountId,
          classId: line.classId,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
        })),
      },
    },
  });
}

/**
 * Post every due occurrence (nextRun <= today) for active auto-post schedules.
 * Returns the number of journal entries created.
 */
export async function runDueRecurring(businessId: string): Promise<number> {
  const today = todayUTC();
  const due = await prisma.recurringTransaction.findMany({
    where: { businessId, isActive: true, autoPost: true, nextRun: { lte: today } },
  });
  let posted = 0;
  for (const recurring of due) {
    let next = recurring.nextRun;
    while (next <= today && (!recurring.endDate || next <= recurring.endDate)) {
      await postOccurrence(recurring.id, next);
      posted++;
      next = advanceDate(next, recurring.frequency, recurring.interval);
    }
    const expired = recurring.endDate !== null && next > recurring.endDate;
    await prisma.recurringTransaction.update({
      where: { id: recurring.id },
      data: { nextRun: next, lastRun: today, isActive: !expired },
    });
  }
  return posted;
}

export async function countDueRecurring(businessId: string): Promise<number> {
  return prisma.recurringTransaction.count({
    where: { businessId, isActive: true, nextRun: { lte: todayUTC() } },
  });
}
