import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { toDateInput, todayUTC } from "../../../lib/money";
import { BillForm } from "../../../components/BillForm";

export default async function NewBillPage() {
  const business = await requireBusiness();
  const [contacts, accounts, classes] = await Promise.all([
    prisma.contact.findMany({
      where: { businessId: business.id },
      include: { type: true },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);
  // Vendors first; any contact can still be billed from.
  const vendors = [
    ...contacts.filter((c) => c.type?.name === "Vendor"),
    ...contacts.filter((c) => c.type?.name !== "Vendor"),
  ];
  const today = todayUTC();
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() + 30);
  // Expenses first, then everything else a bill might buy (equipment, inventory…).
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
        <Link href="/bills" className="text-sm text-emerald-600 hover:underline">
          ← Bills
        </Link>
        <h1 className="page-title mt-1">New bill</h1>
      </div>
      <BillForm
        vendors={vendors.map((c) => ({ id: c.id, name: c.name }))}
        accounts={accountOptions.map((a) => ({ id: a.id, label: a.label }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        defaultBillDate={toDateInput(today)}
        defaultDueDate={toDateInput(due)}
      />
    </div>
  );
}
