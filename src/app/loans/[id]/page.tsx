import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { loanState, derivePayments } from "../../../lib/loans";
import { deleteLoan, deleteLoanPayment, closeLoan, reopenLoan } from "../../../lib/actions";
import { formatMoney, formatDate, toDateInput, todayUTC } from "../../../lib/money";
import { PayoffChart, SplitChart } from "../../../components/LoanCharts";
import { LoanPaymentForm } from "../../../components/LoanPaymentForm";
import { LoanWhatIf } from "../../../components/LoanWhatIf";
import { ConfirmButton } from "../../../components/ConfirmButton";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      payments: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: { entry: { include: { lines: true } } },
      },
      lender: true,
      liabilityAccount: true,
      interestAccount: true,
      paymentAccount: true,
      replaces: { select: { id: true, name: true } },
      replacedBy: { select: { id: true, name: true } },
    },
  });
  if (!loan) notFound();
  const closed = loan.status === "CLOSED";

  // Derive principal/interest live from the linked ledger entries.
  const payments = derivePayments(loan, loan.payments);
  const state = loanState(loan, payments);
  const historyBalances: number[] = [];
  let running = loan.principal;
  for (const payment of payments) {
    running -= payment.principal;
    historyBalances.push(Math.max(running, 0));
  }

  const cards = [
    { label: "Current balance", value: formatMoney(state.balance) },
    { label: "Monthly payment", value: `${formatMoney(loan.payment)} @ ${loan.annualRate}%` },
    { label: "Principal paid", value: formatMoney(state.paidPrincipal) },
    { label: "Interest paid", value: formatMoney(state.paidInterest) },
    { label: "Interest remaining", value: formatMoney(state.remainingInterest) },
    {
      label: "Payoff",
      value: state.isPaidOff ? "Paid off 🎉" : state.payoffDate ? formatDate(state.payoffDate) : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/loans" className="text-sm text-emerald-600 hover:underline">
            ← Loans
          </Link>
          <h1 className="page-title mt-1">
            {loan.name}
            {closed && (
              <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                closed
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500">
            {loan.lender && `${loan.lender.name} · `}
            {formatMoney(loan.principal)} over {loan.termMonths} months · pays from{" "}
            {loan.paymentAccount.name} · liability {loan.liabilityAccount.name}
          </p>
          {(loan.replaces || loan.replacedBy.length > 0) && (
            <p className="mt-1 text-sm text-zinc-500">
              {loan.replaces && (
                <>
                  Replaces{" "}
                  <Link href={`/loans/${loan.replaces.id}`} className="text-emerald-600 hover:underline">
                    {loan.replaces.name}
                  </Link>
                </>
              )}
              {loan.replaces && loan.replacedBy.length > 0 && " · "}
              {loan.replacedBy.map((r, i) => (
                <span key={r.id}>
                  {i === 0 ? "Replaced by " : ", "}
                  <Link href={`/loans/${r.id}`} className="text-emerald-600 hover:underline">
                    {r.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {closed ? (
            <form action={reopenLoan}>
              <input type="hidden" name="id" value={loan.id} />
              <button className="btn btn-sm">Reopen</button>
            </form>
          ) : (
            <form action={closeLoan}>
              <input type="hidden" name="id" value={loan.id} />
              <ConfirmButton
                message="Close this loan? It keeps its full history but stops appearing as active and stops payment tracking. You can reopen it later."
                className="btn btn-sm"
              >
                Close loan
              </ConfirmButton>
            </form>
          )}
          <form action={deleteLoan}>
            <input type="hidden" name="id" value={loan.id} />
            <ConfirmButton message={`Delete loan ${loan.name}? Posted payment entries stay in the ledger.`}>
              Delete loan
            </ConfirmButton>
          </form>
        </div>
      </div>

      {closed && (
        <div className="card border-zinc-300 bg-zinc-50 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium">Closed{loan.closedAt ? ` ${formatDate(loan.closedAt)}` : ""}.</span>{" "}
          {loan.closureNote || "This loan is retired — no further payments are tracked. Its history is preserved below."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
            <p className="mt-1 money text-sm font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      {!state.isPaidOff && !closed && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Record this month&apos;s payment</h2>
          <LoanPaymentForm
            loanId={loan.id}
            balance={state.balance}
            annualRate={loan.annualRate}
            payment={loan.payment}
            defaultDate={toDateInput(todayUTC())}
          />
        </div>
      )}

      <div className="card">
        <h2 className="mb-1 font-semibold">Payoff curve</h2>
        <PayoffChart
          principal={loan.principal}
          baseline={state.baseline}
          historyBalances={historyBalances}
          projected={state.projected}
        />
      </div>

      {!state.isPaidOff && !closed && (
        <>
          <div className="card">
            <h2 className="mb-1 font-semibold">Principal vs interest, each remaining payment</h2>
            <SplitChart projected={state.projected} />
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">What if I pay extra principal?</h2>
            <LoanWhatIf
              balance={state.balance}
              annualRate={loan.annualRate}
              payment={loan.payment}
              nextDateISO={state.nextDate.toISOString()}
              remainingInterest={state.remainingInterest}
              remainingMonths={state.projected.length}
              paymentsMade={loan.payments.length}
              termMonths={loan.termMonths}
            />
          </div>
        </>
      )}

      {loan.payments.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Recorded payments</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Date</th>
                <th className="th text-right">Principal</th>
                <th className="th text-right">Interest</th>
                <th className="th text-right">Extra incl.</th>
                <th className="th text-right">Total</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, i) => (
                <tr key={payment.id}>
                  <td className="td text-zinc-500">{i + 1}</td>
                  <td className="td whitespace-nowrap">
                    {payment.entryId ? (
                      <Link href={`/transactions/${payment.entryId}`} className="hover:underline">
                        {formatDate(payment.date)}
                      </Link>
                    ) : (
                      formatDate(payment.date)
                    )}
                  </td>
                  <td className="td text-right money">{formatMoney(payment.principal)}</td>
                  <td className="td text-right money">{formatMoney(payment.interest)}</td>
                  <td className="td text-right money text-zinc-500">
                    {payment.extra ? formatMoney(payment.extra) : ""}
                  </td>
                  <td className="td text-right money">{formatMoney(payment.principal + payment.interest)}</td>
                  <td className="td text-right">
                    <form action={deleteLoanPayment}>
                      <input type="hidden" name="id" value={payment.id} />
                      <ConfirmButton message="Delete this payment and its ledger entry?">✕</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.projected.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Amortization schedule (projected)</h2>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                <tr>
                  <th className="th">#</th>
                  <th className="th">Date</th>
                  <th className="th text-right">Payment</th>
                  <th className="th text-right">Principal</th>
                  <th className="th text-right">Interest</th>
                  <th className="th text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {state.projected.map((row) => (
                  <tr key={row.n}>
                    <td className="td text-zinc-500">{row.n}</td>
                    <td className="td whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="td text-right money">{formatMoney(row.payment)}</td>
                    <td className="td text-right money">{formatMoney(row.principal)}</td>
                    <td className="td text-right money">{formatMoney(row.interest)}</td>
                    <td className="td text-right money">{formatMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
