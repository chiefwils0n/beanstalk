import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { flattenAccounts } from "../../lib/accounting";
import { signedBalance } from "../../lib/types";
import { formatMoney, formatDate, parseDate, parseMoney, toDateInput, todayUTC } from "../../lib/money";
import { undoReconciliation } from "../../lib/actions";
import { ReconcileWorkspace } from "../../components/ReconcileWorkspace";
import { ConfirmButton } from "../../components/ConfirmButton";

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; date?: string; balance?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;

  const accounts = await prisma.account.findMany({
    where: { businessId: business.id, type: { in: ["ASSET", "LIABILITY"] }, isArchived: false },
  });
  const history = await prisma.reconciliation.findMany({
    where: { businessId: business.id },
    include: { account: true, _count: { select: { lines: true } } },
    orderBy: { statementDate: "desc" },
    take: 15,
  });

  let workspace = null;
  if (sp.account && sp.date && sp.balance) {
    const account = await prisma.account.findUnique({ where: { id: sp.account } });
    if (account) {
      let endingBalance: number | null = null;
      try {
        const raw = sp.balance.trim();
        const negative = raw.startsWith("-");
        endingBalance = (negative ? -1 : 1) * parseMoney(raw.replace(/^-/, ""));
      } catch {
        endingBalance = null;
      }
      if (endingBalance !== null) {
        const [reconciledAgg, lines] = await Promise.all([
          prisma.journalLine.aggregate({
            where: { accountId: account.id, cleared: "RECONCILED", entry: { status: "POSTED" } },
            _sum: { debit: true, credit: true },
          }),
          prisma.journalLine.findMany({
            where: {
              accountId: account.id,
              cleared: { not: "RECONCILED" },
              entry: { status: "POSTED", date: { lte: parseDate(sp.date) } },
            },
            include: { entry: true },
            orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
          }),
        ]);
        const beginning = signedBalance(
          account.type,
          reconciledAgg._sum.debit ?? 0,
          reconciledAgg._sum.credit ?? 0
        );
        workspace = (
          <ReconcileWorkspace
            account={{ id: account.id, name: account.name, type: account.type }}
            statementDate={sp.date}
            endingBalance={endingBalance}
            beginning={beginning}
            lines={lines.map((line) => ({
              id: line.id,
              date: formatDate(line.entry.date),
              memo: line.description || line.entry.memo,
              amount: signedBalance(account.type, line.debit, line.credit),
              cleared: line.cleared === "CLEARED",
            }))}
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Reconcile</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Match an account against a bank or card statement: enter the statement&apos;s ending
        balance, check off the transactions that appear on it, and finish when the difference
        reaches zero. Finished lines are marked reconciled and excluded from future sessions.
      </p>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">Account</label>
          <select name="account" defaultValue={sp.account ?? ""} className="input max-w-72" required>
            <option value="">— choose account —</option>
            {flattenAccounts(accounts).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Statement ending date</label>
          <input type="date" name="date" defaultValue={sp.date ?? toDateInput(todayUTC())} className="input" required />
        </div>
        <div>
          <label className="label">Statement ending balance</label>
          <input
            name="balance"
            defaultValue={sp.balance}
            className="input w-36 text-right"
            inputMode="decimal"
            placeholder="e.g. 7,756.90"
            required
          />
        </div>
        <button className="btn btn-primary">Start reconciling</button>
      </form>

      {workspace}

      {history.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Past reconciliations</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Account</th>
                <th className="th">Statement date</th>
                <th className="th text-right">Ending balance</th>
                <th className="th text-right">Lines</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {history.map((rec) => (
                <tr key={rec.id}>
                  <td className="td">{rec.account.name}</td>
                  <td className="td">{formatDate(rec.statementDate)}</td>
                  <td className="td text-right money">{formatMoney(rec.endingBalance)}</td>
                  <td className="td text-right">{rec._count.lines}</td>
                  <td className="td text-right">
                    <form action={undoReconciliation}>
                      <input type="hidden" name="id" value={rec.id} />
                      <ConfirmButton message="Undo this reconciliation? Its lines return to cleared status.">
                        Undo
                      </ConfirmButton>
                    </form>
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
