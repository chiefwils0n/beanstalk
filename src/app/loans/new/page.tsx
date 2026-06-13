import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { createLoan } from "../../../lib/actions";
import { flattenAccounts } from "../../../lib/accounting";
import { toDateInput, todayUTC } from "../../../lib/money";

export default async function NewLoanPage() {
  const business = await requireBusiness();
  const [accounts, contacts, activeLoans] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
    prisma.contact.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.loan.findMany({
      where: { businessId: business.id, status: { not: "CLOSED" } },
      orderBy: { name: "asc" },
    }),
  ]);
  const assetOptions = flattenAccounts(accounts.filter((a) => a.type === "ASSET"));
  const liabilityOptions = flattenAccounts(accounts.filter((a) => a.type === "LIABILITY"));
  const expenseOptions = flattenAccounts(accounts.filter((a) => a.type === "EXPENSE"));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">New loan</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        For an existing loan, enter the <em>current</em> balance as the principal and the
        remaining term. The monthly payment is computed automatically unless you override it.
      </p>
      <form action={createLoan} className="card grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Loan name *</label>
          <input name="name" required className="input" placeholder="SBA loan, truck loan…" />
        </div>
        <div>
          <label className="label">Lender (optional)</label>
          <select name="lenderId" className="input" defaultValue="">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Principal / current balance *</label>
          <input name="principal" required className="input text-right" inputMode="decimal" placeholder="50,000.00" />
        </div>
        <div>
          <label className="label">Annual rate % *</label>
          <input name="annualRate" required className="input text-right" inputMode="decimal" placeholder="6.5" />
        </div>
        <div>
          <label className="label">Term (months) *</label>
          <input name="termMonths" required className="input text-right" inputMode="numeric" placeholder="60" />
        </div>
        <div>
          <label className="label">First payment date *</label>
          <input name="firstPaymentDate" type="date" required className="input" defaultValue={toDateInput(todayUTC())} />
        </div>
        <div>
          <label className="label">Monthly payment (blank = computed)</label>
          <input name="payment" className="input text-right" inputMode="decimal" placeholder="auto" />
        </div>
        <div>
          <label className="label">Payments come from *</label>
          <select name="paymentAccountId" required className="input">
            {assetOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Liability account</label>
          <select name="liabilityAccountId" className="input" defaultValue="">
            <option value="">Create &ldquo;Loan — name&rdquo; automatically</option>
            {liabilityOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Interest expense account</label>
          <select name="interestAccountId" className="input" defaultValue="">
            <option value="">Use/create &ldquo;Interest Expense&rdquo;</option>
            {expenseOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <input name="notes" className="input" />
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="postDisbursement" />
            Post disbursement (new loan, funds received)
          </label>
        </div>
        {activeLoans.length > 0 && (
          <div className="sm:col-span-3">
            <label className="label">Replaces loan (balloon refinance / renegotiated terms)</label>
            <select name="replacesId" className="input sm:max-w-md" defaultValue="">
              <option value="">— none —</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              If set, the selected loan is closed (history kept) and linked as this loan&apos;s
              predecessor.
            </p>
          </div>
        )}
        <div className="sm:col-span-3">
          <button className="btn btn-primary">Create loan</button>
        </div>
      </form>
    </div>
  );
}
