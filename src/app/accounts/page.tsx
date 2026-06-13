import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { getBalances, buildTree, flattenAccounts, type AccountNode } from "../../lib/accounting";
import { createAccount, setAccountArchived, deleteAccount } from "../../lib/actions";
import { formatMoney } from "../../lib/money";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "../../lib/types";
import { ConfirmButton } from "../../components/ConfirmButton";

function AccountRows({ nodes, depth = 0 }: { nodes: AccountNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node) => (
        <AccountRow key={node.account.id} node={node} depth={depth} />
      ))}
    </>
  );
}

function AccountRow({ node, depth }: { node: AccountNode; depth: number }) {
  const { account } = node;
  return (
    <>
      <tr className={account.isArchived ? "opacity-50" : ""}>
        <td className="td">
          <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {account.code && <span className="mr-2 font-mono text-xs text-zinc-400">{account.code}</span>}
            <Link href={`/accounts/${account.id}`} className="hover:underline">
              {account.name}
            </Link>
            {account.isArchived && <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">archived</span>}
          </span>
        </td>
        <td className="td text-xs text-zinc-500">{account.taxLine ?? ""}</td>
        <td className="td text-right money">
          {node.children.length > 0 ? (
            <span title={`Direct: ${formatMoney(node.own)}`}>{formatMoney(node.total)}</span>
          ) : (
            formatMoney(node.total)
          )}
        </td>
        <td className="td text-right whitespace-nowrap">
          <div className="flex justify-end gap-1">
            <form action={setAccountArchived}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="archived" value={String(!account.isArchived)} />
              <button className="btn btn-sm">{account.isArchived ? "Restore" : "Archive"}</button>
            </form>
            <form action={deleteAccount}>
              <input type="hidden" name="id" value={account.id} />
              <ConfirmButton message={`Delete account ${account.name}?`}>Delete</ConfirmButton>
            </form>
          </div>
        </td>
      </tr>
      <AccountRows nodes={node.children} depth={depth + 1} />
    </>
  );
}

export default async function AccountsPage() {
  const business = await requireBusiness();
  const [accounts, balances] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id } }),
    getBalances(business.id),
  ]);
  const options = flattenAccounts(accounts);

  // Section accent per account type, matching the dashboard stat-card palette.
  const titleText = "text-zinc-900 dark:text-zinc-100";
  const typeTone: Record<AccountType, { bar: string; text: string }> = {
    ASSET: { bar: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/40", text: titleText },
    LIABILITY: { bar: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40", text: titleText },
    EQUITY: { bar: "border-l-slate-500 bg-slate-100 dark:bg-slate-800/40", text: titleText },
    INCOME: { bar: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40", text: titleText },
    EXPENSE: { bar: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/40", text: titleText },
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Chart of Accounts</h1>

      {ACCOUNT_TYPES.map((type) => {
        const tree = buildTree(
          accounts.filter((a) => a.type === type),
          balances,
          { includeArchived: true }
        );
        if (tree.length === 0) return null;
        const total = tree.reduce((s, n) => s + n.total, 0);
        const tone = typeTone[type as AccountType];
        return (
          <div key={type} className="card">
            <h2
              className={`mb-3 flex items-center justify-between rounded-lg border-l-4 px-3 py-2 text-base font-bold ${tone.bar} ${tone.text}`}
            >
              {ACCOUNT_TYPE_LABELS[type as AccountType]}
              <span className="money text-sm">{formatMoney(total)}</span>
            </h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Account</th>
                  <th className="th">Tax line</th>
                  <th className="th text-right">Balance</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                <AccountRows nodes={tree} />
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="card">
        <h2 className="mb-3 font-semibold">New account</h2>
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
          <div className="sm:col-span-3">
            <button className="btn btn-primary">Add account</button>
          </div>
        </form>
      </div>
    </div>
  );
}
