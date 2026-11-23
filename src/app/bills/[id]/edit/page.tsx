import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { requireBusiness } from "../../../../lib/business";
import { flattenAccounts } from "../../../../lib/accounting";
import { toDateInput } from "../../../../lib/money";
import { BillForm } from "../../../../components/BillForm";

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await requireBusiness();
  const bill = await prisma.bill.findFirst({
    where: { id, businessId: business.id },
    include: { vendor: true, items: true },
  });
  if (!bill) notFound();
  if (bill.status !== "OPEN") redirect(`/bills/${id}`);

  const [accounts, classes] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);
  const payable = accounts.find((a) => a.type === "LIABILITY" && a.name === "Accounts Payable");
  const options = flattenAccounts(accounts).filter(
    (a) => a.type !== "INCOME" && a.type !== "EQUITY" && a.id !== payable?.id
  );
  const accountOptions = [
    ...options.filter((a) => a.type === "EXPENSE"),
    ...options.filter((a) => a.type !== "EXPENSE"),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/bills/${id}`} className="text-sm text-emerald-600 hover:underline">
          ← Back to bill
        </Link>
        <h1 className="page-title mt-1">Edit bill</h1>
      </div>
      <BillForm
        vendors={[{ id: bill.vendorId, name: bill.vendor.name }]}
        accounts={accountOptions.map((a) => ({ id: a.id, label: a.label }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        defaultBillDate={toDateInput(bill.billDate)}
        defaultDueDate={toDateInput(bill.dueDate)}
        edit={{
          billId: bill.id,
          vendorName: bill.vendor.name,
          number: bill.number ?? "",
          notes: bill.notes ?? "",
          items: bill.items.map((item) => ({
            accountId: item.accountId,
            classId: item.classId ?? "",
            description: item.description,
            amount: (item.amount / 100).toFixed(2),
          })),
        }}
      />
    </div>
  );
}
