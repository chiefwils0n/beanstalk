import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { formatMoney, formatDate, parseDate, toDateInput, todayUTC } from "../../../lib/money";

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  // No "from" means all-time (balance-sheet drills need history from the first entry).
  const from = sp.from ? parseDate(sp.from) : undefined;
  const to = sp.to ? parseDate(sp.to) : today;

  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id } }),
    prisma.journalLine.findMany({
      where: {
        accountId: sp.account || undefined,
        entry: { businessId: business.id, status: "POSTED", date: { gte: from, lte: to } },
      },
      include: { entry: true, account: true },
      orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }],
      take: 1000,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">General Ledger</h1>
          <p className="text-sm text-zinc-500">{business.name}</p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=general-ledger${from ? `&from=${toDateInput(from)}` : ""}&to=${toDateInput(to)}${sp.account ? `&account=${sp.account}` : ""}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">Account</label>
          <select name="account" defaultValue={sp.account ?? ""} className="input max-w-72">
            <option value="">All accounts</option>
            {flattenAccounts(accounts).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From (blank = all time)</label>
          <input type="date" name="from" defaultValue={from ? toDateInput(from) : ""} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={toDateInput(to)} className="input" />
        </div>
        <button className="btn">Run report</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Account</th>
              <th className="th">Memo</th>
              <th className="th text-right">Debit</th>
              <th className="th text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={5}>
                  No activity in this range.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="td whitespace-nowrap text-zinc-500">{formatDate(line.entry.date)}</td>
                <td className="td">
                  <Link
                    href={`/reports/general-ledger?account=${line.accountId}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
                    className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                    title={`Filter to ${line.account.name}`}
                  >
                    {line.account.name}
                  </Link>
                </td>
                <td className="td">
                  <Link href={`/transactions/${line.entryId}`} className="hover:underline">
                    {line.description || line.entry.memo}
                  </Link>
                </td>
                <td className="td text-right font-mono">{line.debit ? formatMoney(line.debit) : ""}</td>
                <td className="td text-right font-mono">{line.credit ? formatMoney(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
