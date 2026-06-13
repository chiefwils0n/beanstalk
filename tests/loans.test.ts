import { describe, it, expect } from "vitest";
import {
  standardPayment,
  projectSchedule,
  totalInterest,
  addMonthsUTC,
  nextPaymentSplit,
  loanState,
  derivePayments,
} from "../src/lib/loans";
import { parseDate, toDateInput } from "../src/lib/money";

describe("standardPayment", () => {
  it("matches known real-world loans to the penny", () => {
    // 521 Francis: $69,000 @ 5% / 30yr → $370.41
    expect(standardPayment(6900000, 5, 360)).toBe(37041);
    // 2305 Jake: $60,237.45 @ 7.03% / 180mo → $542.44
    expect(standardPayment(6023745, 7.03, 180)).toBe(54244);
  });

  it("handles a zero-interest loan", () => {
    expect(standardPayment(120000, 0, 12)).toBe(10000);
  });
});

describe("projectSchedule", () => {
  it("fully amortizes: principal sums to the balance and ends at zero", () => {
    const start = parseDate("2026-07-01");
    const rows = projectSchedule({ balance: 5000000, annualRatePct: 6.5, payment: 97831, startDate: start });
    expect(rows.length).toBe(60);
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(5000000);
    expect(rows[rows.length - 1].balance).toBe(0);
    expect(totalInterest(rows)).toBe(869845);
  });

  it("a zero-rate loan charges no interest", () => {
    const rows = projectSchedule({
      balance: 120000,
      annualRatePct: 0,
      payment: 10000,
      startDate: parseDate("2026-07-01"),
    });
    expect(rows.length).toBe(12);
    expect(totalInterest(rows)).toBe(0);
  });

  it("returns nothing when the payment cannot cover interest", () => {
    const rows = projectSchedule({
      balance: 1000000,
      annualRatePct: 12,
      payment: 5000, // interest alone is 10,000/mo
      startDate: parseDate("2026-07-01"),
    });
    expect(rows).toEqual([]);
  });
});

describe("addMonthsUTC", () => {
  it("clamps to the last day of shorter months", () => {
    expect(toDateInput(addMonthsUTC(parseDate("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toDateInput(addMonthsUTC(parseDate("2028-02-29"), 12))).toBe("2029-02-28");
    expect(toDateInput(addMonthsUTC(parseDate("2026-12-15"), 1))).toBe("2027-01-15");
  });
});

describe("nextPaymentSplit", () => {
  it("splits a payment into interest then principal", () => {
    const split = nextPaymentSplit(1200000, 12, 20000);
    expect(split.interest).toBe(12000); // 1% of 1,200,000
    expect(split.principal).toBe(8000);
    expect(split.total).toBe(20000);
  });

  it("never pays more principal than the balance (final payment)", () => {
    const split = nextPaymentSplit(5000, 12, 20000);
    expect(split.principal).toBe(5000);
    expect(split.total).toBe(5000 + split.interest);
  });
});

describe("loanState", () => {
  it("derives balance and paid totals from recorded payments", () => {
    const loan = {
      principal: 6900000,
      annualRate: 5,
      payment: 37041,
      termMonths: 360,
      firstPaymentDate: parseDate("2026-07-01"),
    };
    const state = loanState(loan, [
      { principal: 100000, interest: 28750 },
      { principal: 100417, interest: 28333 },
    ]);
    expect(state.paidPrincipal).toBe(200417);
    expect(state.paidInterest).toBe(57083);
    expect(state.balance).toBe(6900000 - 200417);
    expect(state.isPaidOff).toBe(false);
  });
});

describe("derivePayments — ledger is the source of truth", () => {
  const loan = { liabilityAccountId: "liab", interestAccountId: "int" };

  it("derives principal/interest from the linked posted entry's lines", () => {
    const [p] = derivePayments(loan, [
      {
        id: "p1", date: new Date("2026-01-10T00:00:00Z"), principal: 999, interest: 999, extra: 0, entryId: "e1",
        entry: {
          status: "POSTED",
          date: new Date("2026-01-10T00:00:00Z"),
          lines: [
            { accountId: "liab", debit: 20450, credit: 0 }, // principal
            { accountId: "int", debit: 33794, credit: 0 },  // interest
            { accountId: "cash", debit: 0, credit: 54244 },
          ],
        },
      },
    ]);
    // stored snapshot was 999/999 but the ledger says otherwise
    expect(p.principal).toBe(20450);
    expect(p.interest).toBe(33794);
  });

  it("counts a voided entry as zero", () => {
    const [p] = derivePayments(loan, [
      {
        id: "p1", date: new Date("2026-01-10T00:00:00Z"), principal: 20450, interest: 33794, extra: 0, entryId: "e1",
        entry: { status: "VOID", date: new Date("2026-01-10T00:00:00Z"), lines: [{ accountId: "liab", debit: 20450, credit: 0 }] },
      },
    ]);
    expect(p.principal).toBe(0);
    expect(p.interest).toBe(0);
  });

  it("falls back to the stored snapshot when no entry is linked", () => {
    const [p] = derivePayments(loan, [
      { id: "p1", date: new Date("2026-01-10T00:00:00Z"), principal: 11111, interest: 222, extra: 0, entryId: null, entry: null },
    ]);
    expect(p.principal).toBe(11111);
    expect(p.interest).toBe(222);
  });
});
