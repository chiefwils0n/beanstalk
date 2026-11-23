import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { formatMoney, formatDate, todayUTC } from "../../lib/money";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  VOID: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

export default async function BillsPage() {
  const business = await requireBusiness();
  const today = todayUTC();
  const [bills, payable] = await Promise.all([
    prisma.bill.findMany({
      where: { businessId: business.id },
      include: { vendor: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.account.findFirst({ where: { businessId: business.id, type: "LIABILITY", name: "Accounts Payable" } }),
  ]);
  const paidRows = payable
    ? await prisma.journalLine.findMany({
        where: { accountId: payable.id, debit: { gt: 0 }, entry: { status: "POSTED", billId: { not: null } } },
        select: { debit: true, entry: { select: { billId: true } } },
      })
    : [];
  const paidByBill = new Map<string, number>();
  for (const row of paidRows) {
    const id = row.entry.billId as string;
    paidByBill.set(id, (paidByBill.get(id) ?? 0) + row.debit);
  }
  const balanceOf = (bill: (typeof bills)[number]) =>
    bill.status === "OPEN" ? bill.total - (paidByBill.get(bill.id) ?? 0) : 0;
  const open = bills.filter((b) => b.status === "OPEN");
  const owed = open.reduce((s, b) => s + balanceOf(b), 0);
  const overdue = open.filter((b) => b.dueDate < today).reduce((s, b) => s + balanceOf(b), 0);
  // Open bills first (soonest due on top), then the rest, newest first.
  const ordered = [...open, ...bills.filter((b) => b.status !== "OPEN").reverse()];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Bills</h1>
        <div className="flex gap-2">
          <Link href="/reports/payables-ageing" className="btn">
            Payables ageing
          </Link>
          <Link href="/bills/new" className="btn btn-primary">
            + New bill
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-zinc-500">You owe</p>
          <p className="money mt-1 text-xl font-semibold">{formatMoney(owed)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Overdue</p>
          <p className={`money mt-1 text-xl font-semibold ${overdue > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
            {formatMoney(overdue)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Open bills</p>
          <p className="mt-1 text-xl font-semibold">{open.length}</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Vendor</th>
              <th className="th">Bill no.</th>
              <th className="th">Bill date</th>
              <th className="th">Due</th>
              <th className="th text-right">Total</th>
              <th className="th text-right">Balance due</th>
              <th className="th text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={7}>
                  No bills yet. Enter a bill when it arrives and pay it later — the expense lands on
                  the bill date either way.
                </td>
              </tr>
            )}
            {ordered.map((bill) => {
              const isOverdue = bill.status === "OPEN" && bill.dueDate < today;
              return (
                <tr key={bill.id}>
                  <td className="td">
                    <Link href={`/bills/${bill.id}`} className="font-medium hover:underline">
                      {bill.vendor.name}
                    </Link>
                  </td>
                  <td className="td text-zinc-500">{bill.number ?? ""}</td>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(bill.billDate)}</td>
                  <td className={`td whitespace-nowrap ${isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                    {formatDate(bill.dueDate)}
                    {isOverdue && " (overdue)"}
                  </td>
                  <td className="td text-right money">{formatMoney(bill.total)}</td>
                  <td className="td text-right money">{bill.status === "OPEN" ? formatMoney(balanceOf(bill)) : ""}</td>
                  <td className="td text-center">
                    <span className={`badge ${STATUS_STYLES[bill.status] ?? ""}`}>{bill.status.toLowerCase()}</span>
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
