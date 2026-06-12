/**
 * Pure amortization math, shared by server actions and client calculators.
 * All money values are integer cents; rates are annual percentages (e.g. 6.5).
 */

export type ScheduleRow = {
  n: number; // 1-based payment number
  date: Date;
  payment: number;
  interest: number;
  principal: number;
  balance: number; // after this payment
};

export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/** Standard fixed monthly payment for a fully amortizing loan. */
export function standardPayment(principal: number, annualRatePct: number, termMonths: number): number {
  const r = monthlyRate(annualRatePct);
  if (termMonths <= 0) return principal;
  if (r === 0) return Math.ceil(principal / termMonths);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}

export function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * Project the remaining schedule from a balance. The final payment is clamped
 * to exactly pay off the loan. Returns [] if the payment doesn't cover interest.
 */
export function projectSchedule(opts: {
  balance: number;
  annualRatePct: number;
  payment: number;
  startDate: Date; // date of the first projected payment
  startIndex?: number; // payments already made
  maxMonths?: number;
}): ScheduleRow[] {
  const r = monthlyRate(opts.annualRatePct);
  const startIndex = opts.startIndex ?? 0;
  const maxMonths = opts.maxMonths ?? 600;
  const rows: ScheduleRow[] = [];
  let balance = opts.balance;
  for (let i = 0; balance > 0 && i < maxMonths; i++) {
    const interest = Math.round(balance * r);
    let principal = opts.payment - interest;
    if (principal <= 0) break; // payment never amortizes
    let payment = opts.payment;
    if (principal >= balance) {
      principal = balance;
      payment = principal + interest;
    }
    balance -= principal;
    rows.push({
      n: startIndex + i + 1,
      date: addMonthsUTC(opts.startDate, i),
      payment,
      interest,
      principal,
      balance,
    });
  }
  return rows;
}

export function totalInterest(rows: ScheduleRow[]): number {
  return rows.reduce((s, row) => s + row.interest, 0);
}

export type LoanLike = {
  principal: number;
  annualRate: number;
  payment: number;
  termMonths: number;
  firstPaymentDate: Date;
};

export type PaymentLike = { principal: number; interest: number };

/** Current position of a loan given its recorded payments. */
export function loanState(loan: LoanLike, payments: PaymentLike[]) {
  const paidPrincipal = payments.reduce((s, p) => s + p.principal, 0);
  const paidInterest = payments.reduce((s, p) => s + p.interest, 0);
  const balance = Math.max(0, loan.principal - paidPrincipal);
  const nextDate = addMonthsUTC(loan.firstPaymentDate, payments.length);
  const projected = projectSchedule({
    balance,
    annualRatePct: loan.annualRate,
    payment: loan.payment,
    startDate: nextDate,
    startIndex: payments.length,
  });
  const baseline = projectSchedule({
    balance: loan.principal,
    annualRatePct: loan.annualRate,
    payment: loan.payment,
    startDate: loan.firstPaymentDate,
  });
  const remainingInterest = totalInterest(projected);
  return {
    balance,
    paidPrincipal,
    paidInterest,
    nextDate,
    projected,
    baseline,
    remainingInterest,
    payoffDate: projected.length ? projected[projected.length - 1].date : null,
    isPaidOff: balance === 0,
  };
}

/** Split of the next regular payment at a given balance. */
export function nextPaymentSplit(balance: number, annualRatePct: number, payment: number) {
  const interest = Math.round(balance * monthlyRate(annualRatePct));
  const principal = Math.min(Math.max(payment - interest, 0), balance);
  return { interest, principal, total: principal >= balance ? balance + interest : payment };
}
