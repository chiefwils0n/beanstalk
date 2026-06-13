import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../lib/db";
import { flattenAccounts } from "../../../lib/accounting";
import { updateAccount } from "../../../lib/actions";
import { formatMoney, formatDate } from "../../../lib/money";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) notFound();

  const [siblings, lines] = await Promise.all([
    prisma.account.findMany({ where: { businessId: account.businessId, type: account.type } }),
    prisma.journalLine.findMany({
      where: { accountId: id, entry: { status: "POSTED" } },
      include: { entry: true },
      orderBy: { entry: { date: "desc" } },
      take: 50,
    }),
  ]);
  const parentOptions = flattenAccounts(siblings).filter((o) => o.id !== id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/accounts" className="text-sm text-emerald-600 hover:underline">
          ← Chart of Accounts
        </Link>
        <h1 className="page-title mt-1">
          {account.code && <span className="mr-2 font-mono text-zinc-400">{account.code}</span>}
          {account.name}
        </h1>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Edit account</h2>
        <form action={updateAccount.bind(null, id)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Name</label>
            <input name="name" defaultValue={account.name} className="input" />
          </div>
          <div>
            <label className="label">Code</label>
            <input name="code" defaultValue={account.code ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Parent account</label>
            <select name="parentId" className="input" defaultValue={account.parentId ?? ""}>
              <option value="">— none (top level) —</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tax line</label>
            <input name="taxLine" defaultValue={account.taxLine ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <input name="description" defaultValue={account.description ?? ""} className="input" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Recent activity</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">No transactions posted to this account.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Memo</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="td whitespace-nowrap text-zinc-500">{formatDate(line.entry.date)}</td>
                  <td className="td">
                    <Link href={`/transactions/${line.entryId}`} className="hover:underline">
                      {line.entry.memo}
                    </Link>
                  </td>
                  <td className="td text-right money">{line.debit ? formatMoney(line.debit) : ""}</td>
                  <td className="td text-right money">{line.credit ? formatMoney(line.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
