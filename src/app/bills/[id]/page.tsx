import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { voidBill, deleteBill } from "../../../lib/actions";
import { cashFlowSections } from "../../../lib/reports";
import { flattenAccounts } from "../../../lib/accounting";
import { formatMoney, formatDate, toDateInput, todayUTC } from "../../../lib/money";
import { BillPaymentForm } from "../../../components/BillPaymentForm";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { ClosedPeriodNote } from "../../../components/ClosedPeriodNote";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await requireBusiness();
  const bill = await prisma.bill.findFirst({
    where: { id, businessId: business.id },
    include: {
      vendor: true,
      items: { include: { account: true, class: true } },
      entries: {
        include: { lines: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!bill) notFound();

  const payable = await prisma.account.findFirst({
    where: { businessId: business.id, type: "LIABILITY", name: "Accounts Payable" },
  });
  const posted = bill.entries.filter((e) => e.status === "POSTED");
  const paid = payable
    ? posted.reduce(
        (sum, e) => sum + e.lines.filter((l) => l.accountId === payable.id).reduce((s, l) => s + l.debit, 0),
        0
      )
    : 0;
  const balanceDue = bill.status === "VOID" ? 0 : bill.total - paid;
  const overdue = bill.status === "OPEN" && bill.dueDate < todayUTC();
  const lock = business.lockDate;
  const lockDate = lock && posted.some((e) => e.date <= lock) ? lock : null;

  // Pay from a bank account or a credit card. Header accounts (those with
  // sub-accounts) are left out so the default is a real account.
  const { accounts, sections } = await cashFlowSections(business.id);
  const active = accounts.filter((a) => !a.isArchived);
  const parents = new Set(active.map((a) => a.parentId).filter(Boolean));
  const byId = new Map(active.map((a) => [a.id, a]));
  const payFrom = flattenAccounts(active).filter((option) => {
    const account = byId.get(option.id);
    if (!account || account.id === payable?.id || parents.has(account.id)) return false;
    return sections.get(account.id) === "CASH" || (account.type === "LIABILITY" && /card|credit/i.test(account.name));
  });
  const cashFirst = [
    ...payFrom.filter((a) => sections.get(a.id) === "CASH"),
    ...payFrom.filter((a) => sections.get(a.id) !== "CASH"),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/bills" className="text-sm text-emerald-600 hover:underline">
            ← Bills
          </Link>
          <h1 className="page-title mt-1">
            {bill.vendor.name}
            {bill.number && <span className="ml-2 text-zinc-400">{bill.number}</span>}
            <span className="badge ml-2 bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {bill.status.toLowerCase()}
            </span>
          </h1>
          <p className="text-sm text-zinc-500">
            Bill dated {formatDate(bill.billDate)} · due{" "}
            <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>
              {formatDate(bill.dueDate)}
              {overdue && " (overdue)"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lockDate && <ClosedPeriodNote lockDate={lockDate} />}
          {!lockDate && bill.status !== "VOID" && (
            <form action={voidBill}>
              <input type="hidden" name="id" value={bill.id} />
              <ConfirmButton
                message="Void this bill? Its ledger entries, including any payments, are voided too."
                className="btn btn-sm"
              >
                Void
              </ConfirmButton>
            </form>
          )}
          {bill.status === "VOID" && (
            <form action={deleteBill}>
              <input type="hidden" name="id" value={bill.id} />
              <ConfirmButton message="Delete this voided bill?">Delete</ConfirmButton>
            </form>
          )}
        </div>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Description</th>
              <th className="th">Account</th>
              <th className="th">Class</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((item) => (
              <tr key={item.id}>
                <td className="td">{item.description}</td>
                <td className="td text-zinc-500">{item.account.name}</td>
                <td className="td text-zinc-500">{item.class?.name ?? ""}</td>
                <td className="td text-right money">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="td font-semibold" colSpan={3}>
                Total
              </td>
              <td className="td text-right money font-semibold">{formatMoney(bill.total)}</td>
            </tr>
            <tr>
              <td className="td" colSpan={3}>
                Paid
              </td>
              <td className="td text-right money">{formatMoney(paid)}</td>
            </tr>
            <tr>
              <td className="td font-semibold" colSpan={3}>
                Balance due
              </td>
              <td className="td text-right money font-semibold">{formatMoney(balanceDue)}</td>
            </tr>
          </tfoot>
        </table>
        {bill.notes && <p className="mt-3 text-sm text-zinc-500">{bill.notes}</p>}
      </div>

      {bill.status === "OPEN" && balanceDue > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Record payment</h2>
          <BillPaymentForm
            billId={bill.id}
            accounts={cashFirst.map((a) => ({ id: a.id, label: a.label.trim() }))}
            defaultDate={toDateInput(todayUTC())}
            defaultAmount={(balanceDue / 100).toFixed(2)}
          />
        </div>
      )}

      {bill.entries.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Ledger entries</h2>
          <table className="w-full">
            <tbody>
              {bill.entries.map((entry) => (
                <tr key={entry.id} className={entry.status === "VOID" ? "text-zinc-400 line-through" : ""}>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(entry.date)}</td>
                  <td className="td">
                    <Link href={`/transactions/${entry.id}`} className="hover:underline">
                      {entry.memo}
                    </Link>
                  </td>
                  <td className="td text-right money">
                    {formatMoney(entry.lines.reduce((s, l) => s + l.debit, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
