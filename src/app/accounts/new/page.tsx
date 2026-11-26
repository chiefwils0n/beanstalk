import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { createAccount } from "../../../lib/actions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "../../../lib/types";

export default async function NewAccountPage() {
  const business = await requireBusiness();
  const accounts = await prisma.account.findMany({ where: { businessId: business.id } });
  const options = flattenAccounts(accounts);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/accounts" className="text-sm text-emerald-600 hover:underline">
          ← Chart of Accounts
        </Link>
        <h1 className="page-title mt-1">New account</h1>
      </div>
      <div className="card">
        <form action={createAccount} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Name *</label>
            <input name="name" required className="input" />
          </div>
          <div>
            <label className="label">Type *</label>
            <select name="type" className="input" required>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type as AccountType]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Code</label>
            <input name="code" className="input" placeholder="e.g. 6150" />
          </div>
          <div>
            <label className="label">Parent account (nests underneath)</label>
            <select name="parentId" className="input" defaultValue="">
              <option value="">— none (top level) —</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tax line (for tax reports)</label>
            <input name="taxLine" className="input" placeholder="e.g. Supplies (Line 22)" />
          </div>
          <div>
            <label className="label">Description</label>
            <input name="description" className="input" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-3">
            <button className="btn btn-primary">Add account</button>
            <Link href="/accounts" className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
