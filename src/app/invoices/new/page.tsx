import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { toDateInput, todayUTC } from "../../../lib/money";
import { InvoiceForm } from "../../../components/InvoiceForm";

export default async function NewInvoicePage() {
  const business = await requireBusiness();
  const [customers, incomeAccounts] = await Promise.all([
    prisma.customer.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.account.findMany({
      where: { businessId: business.id, type: "INCOME", isArchived: false },
      orderBy: { code: "asc" },
    }),
  ]);
  const today = todayUTC();
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() + 30);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">New invoice</h1>
      <InvoiceForm
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        incomeAccounts={incomeAccounts.map((a) => ({
          id: a.id,
          label: `${a.code ? a.code + " · " : ""}${a.name}`,
        }))}
        defaultIssueDate={toDateInput(today)}
        defaultDueDate={toDateInput(due)}
      />
    </div>
  );
}
