import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { formatMoney, formatDate, parseDate } from "../../lib/money";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tag?: string; q?: string }>;
}) {
  const business = await requireBusiness();
  const { from, to, tag, q } = await searchParams;

  const [entries, tags] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        businessId: business.id,
        date: {
          gte: from ? parseDate(from) : undefined,
          lte: to ? parseDate(to) : undefined,
        },
        tags: tag ? { some: { tagId: tag } } : undefined,
        memo: q ? { contains: q } : undefined,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { lines: { include: { account: true } }, tags: { include: { tag: true } } },
    }),
    prisma.tag.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Transactions</h1>
        <Link href="/transactions/new" className="btn btn-primary">
          + New transaction
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">From</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="to" defaultValue={to} className="input" />
        </div>
        <div>
          <label className="label">Tag</label>
          <select name="tag" defaultValue={tag ?? ""} className="input">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Search memo</label>
          <input name="q" defaultValue={q} className="input" placeholder="Search…" />
        </div>
        <button className="btn">Filter</button>
        <Link href="/transactions" className="btn">
          Clear
        </Link>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Memo</th>
              <th className="th">Accounts</th>
              <th className="th text-right">Amount</th>
              <th className="th text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={5}>
                  No transactions found.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className={entry.status === "VOID" ? "opacity-50" : ""}>
                <td className="td whitespace-nowrap text-zinc-500">{formatDate(entry.date)}</td>
                <td className="td">
                  <Link href={`/transactions/${entry.id}`} className="font-medium hover:underline">
                    {entry.memo}
                  </Link>
                  {entry.reference && (
                    <span className="ml-2 text-xs text-zinc-400">#{entry.reference}</span>
                  )}
                  {entry.tags.map(({ tag: t }) => (
                    <span key={t.id} className="badge ml-1.5 text-white" style={{ backgroundColor: t.color }}>
                      {t.name}
                    </span>
                  ))}
                </td>
                <td className="td text-xs text-zinc-500">
                  {[...new Set(entry.lines.map((l) => l.account.name))].join(", ")}
                </td>
                <td className="td text-right font-mono">
                  {formatMoney(entry.lines.reduce((s, l) => s + l.debit, 0))}
                </td>
                <td className="td text-center">
                  {entry.status === "VOID" && (
                    <span className="badge bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      void
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
