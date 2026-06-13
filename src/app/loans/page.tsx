import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { loanState, derivePayments } from "../../lib/loans";
import { formatMoney, formatDate } from "../../lib/money";
import type { Loan, LoanPayment, Contact, JournalLine, JournalEntry } from "@prisma/client";

type LoanWithData = Loan & {
  lender: Contact | null;
  payments: (LoanPayment & { entry: (JournalEntry & { lines: JournalLine[] }) | null })[];
};

function LoanCard({ loan, closed }: { loan: LoanWithData; closed?: boolean }) {
  const state = loanState(loan, derivePayments(loan, loan.payments));
  const progress = loan.principal > 0 ? state.paidPrincipal / loan.principal : 0;
  return (
    <Link
      href={`/loans/${loan.id}`}
      className={`card hover:border-emerald-400 dark:hover:border-emerald-600 ${closed ? "opacity-70" : ""}`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">
          {loan.name}
          {closed && (
            <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              closed
            </span>
          )}
        </h2>
        <span className="text-sm text-zinc-500">
          {loan.annualRate}% · {formatMoney(loan.payment)}/mo
        </span>
      </div>
      {loan.lender && <p className="text-xs text-zinc-400">{loan.lender.name}</p>}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${closed ? "bg-zinc-400" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(progress * 100, 100).toFixed(1)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span className="text-zinc-500">
          {closed
            ? `Closed ${loan.closedAt ? formatDate(loan.closedAt) : ""}`
            : state.isPaidOff
              ? "Paid off 🎉"
              : `Balance ${formatMoney(state.balance)}`}
        </span>
        <span className="text-zinc-500">
          {!closed && state.payoffDate ? `payoff ${formatDate(state.payoffDate)}` : ""}
        </span>
      </div>
    </Link>
  );
}

export default async function LoansPage() {
  const business = await requireBusiness();
  const loans = await prisma.loan.findMany({
    where: { businessId: business.id },
    include: {
      payments: { orderBy: { date: "asc" }, include: { entry: { include: { lines: true } } } },
      lender: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const active = loans.filter((l) => l.status !== "CLOSED");
  const closed = loans.filter((l) => l.status === "CLOSED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Loans</h1>
        <Link href="/loans/new" className="btn btn-primary">
          + New loan
        </Link>
      </div>

      {loans.length === 0 && (
        <div className="card text-sm text-zinc-500">
          Track each loan&apos;s amortization, record monthly principal &amp; interest with one
          click, and see how extra principal changes the payoff.
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {active.map((loan) => (
            <LoanCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Closed</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {closed.map((loan) => (
              <LoanCard key={loan.id} loan={loan} closed />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
