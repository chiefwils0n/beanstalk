import { describe, it, expect } from "vitest";
import { lockedDateError } from "../src/lib/periodLock";
import { ageingBucket, buildAgeing, daysPastDue } from "../src/lib/ageing";
import { classifyAccounts, buildCashFlow, type CashFlowAccount } from "../src/lib/cashFlow";
import { budgetReport, monthsBetween, parseYearMonth } from "../src/lib/budget";
import { contactPayments, default1099Threshold } from "../src/lib/vendorPayments";
import { loanPaymentFromLines } from "../src/lib/loans";
import { parseDate } from "../src/lib/money";

describe("lockedDateError", () => {
  const lock = parseDate("2026-06-30");
  it("allows anything when no closing date is set", () => {
    expect(lockedDateError(null, [parseDate("2020-01-01")])).toBeNull();
  });
  it("blocks dates on or before the closing date", () => {
    expect(lockedDateError(lock, [parseDate("2026-06-30")])).toContain("2026-06-30");
    expect(lockedDateError(lock, [parseDate("2026-07-01"), parseDate("2026-01-15")])).toContain("2026-01-15");
  });
  it("allows dates after the closing date", () => {
    expect(lockedDateError(lock, [parseDate("2026-07-01")])).toBeNull();
  });
});

describe("ageing", () => {
  const asOf = parseDate("2026-11-23");
  it("buckets by days past due", () => {
    expect(daysPastDue(parseDate("2026-11-22"), asOf)).toBe(1);
    expect(ageingBucket(parseDate("2026-11-23"), asOf)).toBe("current");
    expect(ageingBucket(parseDate("2026-12-15"), asOf)).toBe("current");
    expect(ageingBucket(parseDate("2026-10-24"), asOf)).toBe("d1_30");
    expect(ageingBucket(parseDate("2026-10-23"), asOf)).toBe("d31_60");
    expect(ageingBucket(parseDate("2026-09-24"), asOf)).toBe("d31_60");
    expect(ageingBucket(parseDate("2026-08-25"), asOf)).toBe("d61_90");
    expect(ageingBucket(parseDate("2026-08-24"), asOf)).toBe("d90plus");
  });
  it("groups by contact, drops settled documents, and totals each bucket", () => {
    const doc = (id: string, contact: string, due: string, open: number) => ({
      id,
      label: id,
      contactId: contact,
      contactName: contact,
      date: parseDate("2026-01-01"),
      dueDate: parseDate(due),
      open,
    });
    const report = buildAgeing(
      [doc("a", "Zed", "2026-12-01", 1000), doc("b", "Amy", "2026-10-01", 2500), doc("c", "Amy", "2026-11-20", 500), doc("d", "Amy", "2026-01-01", 0)],
      asOf
    );
    expect(report.groups.map((g) => g.contactName)).toEqual(["Amy", "Zed"]);
    expect(report.groups[0].docs.map((d) => d.id)).toEqual(["b", "c"]);
    expect(report.groups[0].totals).toMatchObject({ d1_30: 500, d31_60: 2500 });
    expect(report.totals.current).toBe(1000);
    expect(report.total).toBe(4000);
  });
});

describe("cash flow", () => {
  const acct = (id: string, name: string, type: string, parentId: string | null = null, cashFlow: string | null = null): CashFlowAccount => ({
    id,
    name,
    type,
    parentId,
    cashFlow,
  });
  const accounts = [
    acct("bank", "Cash & Bank", "ASSET"),
    acct("chk", "Checking", "ASSET", "bank"),
    acct("ar", "Accounts Receivable", "ASSET"),
    acct("fixed", "Fixed Assets", "ASSET"),
    acct("truck", "Truck", "ASSET", "fixed"),
    acct("ap", "Accounts Payable", "LIABILITY"),
    acct("loans", "Loans Payable", "LIABILITY"),
    acct("truckloan", "Truck", "LIABILITY", "loans"),
    acct("odd", "First National 4417", "ASSET"),
    acct("draws", "Owner Draws", "EQUITY"),
    acct("sales", "Sales", "INCOME"),
    acct("rent", "Rent", "EXPENSE"),
    acct("deposit", "Security deposits held", "LIABILITY", null, "FINANCING"),
  ];
  const sections = classifyAccounts(accounts, { cashIds: new Set(["odd"]) });

  it("classifies by setting, ancestry, hints and name", () => {
    expect(sections.get("chk")).toBe("CASH");
    expect(sections.get("odd")).toBe("CASH");
    expect(sections.get("ar")).toBe("OPERATING");
    expect(sections.get("truck")).toBe("INVESTING");
    expect(sections.get("ap")).toBe("OPERATING");
    expect(sections.get("truckloan")).toBe("FINANCING");
    expect(sections.get("draws")).toBe("FINANCING");
    expect(sections.get("deposit")).toBe("FINANCING");
  });

  it("never treats a non-asset as cash", () => {
    const s = classifyAccounts([acct("p", "Parent", "LIABILITY", null, "CASH")]);
    expect(s.get("p")).toBe("OPERATING");
  });

  it("explains the whole change in cash", () => {
    const raw = (debit: number, credit: number) => ({ debit, credit });
    const opening = new Map([["chk", raw(100000, 0)], ["draws", raw(0, 100000)]]);
    // Sales 5000 on account (1000 collected), rent 1200 paid, truck 8000 bought
    // with a 6000 loan, 500 owner draw.
    const period = new Map([
      ["sales", raw(0, 500000)],
      ["ar", raw(500000, 100000)],
      ["rent", raw(120000, 0)],
      ["truck", raw(800000, 0)],
      ["truckloan", raw(0, 600000)],
      ["draws", raw(50000, 0)],
      ["chk", raw(700000, 970000)],
    ]);
    const cf = buildCashFlow(accounts, sections, opening, period);
    expect(cf.netIncome).toBe(380000);
    expect(cf.operating).toBe(-20000);
    expect(cf.investing).toBe(-800000);
    expect(cf.financing).toBe(550000);
    expect(cf.netChange).toBe(-270000);
    expect(cf.cashChange).toBe(-270000);
    expect(cf.cashStart).toBe(100000);
    expect(cf.cashEnd).toBe(-170000);
    expect(cf.unexplained).toBe(0);
  });
});

describe("budget", () => {
  it("lists the months in a range", () => {
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(monthsBetween({ year: 2025, month: 11 }, { year: 2026, month: 2 })).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
    expect(monthsBetween({ year: 2026, month: 3 }, { year: 2026, month: 1 })).toEqual([]);
  });
  it("compares actual with budget and judges the variance by account type", () => {
    const accounts = [
      { id: "s", name: "Sales", code: "4000", type: "INCOME" },
      { id: "r", name: "Rent", code: "6080", type: "EXPENSE" },
      { id: "u", name: "Utilities", code: "6120", type: "EXPENSE" },
      { id: "x", name: "Unused", code: "6999", type: "EXPENSE" },
    ];
    const report = budgetReport(
      accounts,
      new Map([["s", 90000], ["r", 50000], ["u", 12000]]),
      new Map([["s", 100000], ["r", 50000], ["u", 10000]])
    );
    expect(report.income[0]).toMatchObject({ variance: -10000, percent: 90, favorable: false });
    expect(report.expenses.map((r) => r.account.id)).toEqual(["r", "u"]);
    expect(report.expenses[0].favorable).toBe(true);
    expect(report.expenses[1]).toMatchObject({ variance: 2000, percent: 120, favorable: false });
    expect(report.net).toMatchObject({ actual: 28000, budget: 40000, variance: -12000 });
  });
});

describe("contactPayments", () => {
  const cash = new Set(["chk"]);
  it("counts only cash that left the bank, by contact", () => {
    const totals = contactPayments(
      [
        // direct expense paid by cheque
        { lines: [{ accountId: "repairs", contactId: "v1", debit: 40000, credit: 0 }, { accountId: "chk", contactId: null, debit: 0, credit: 40000 }] },
        // bill entered — no cash yet
        { lines: [{ accountId: "repairs", contactId: "v1", debit: 90000, credit: 0 }, { accountId: "ap", contactId: "v1", debit: 0, credit: 90000 }] },
        // bill paid
        { lines: [{ accountId: "ap", contactId: "v1", debit: 90000, credit: 0 }, { accountId: "chk", contactId: "v1", debit: 0, credit: 90000 }] },
        // paid by credit card — not reportable
        { lines: [{ accountId: "repairs", contactId: "v2", debit: 70000, credit: 0 }, { accountId: "card", contactId: null, debit: 0, credit: 70000 }] },
        // money received from a customer
        { lines: [{ accountId: "chk", contactId: "c1", debit: 5000, credit: 0 }, { accountId: "sales", contactId: "c1", debit: 0, credit: 5000 }] },
      ],
      cash
    );
    expect(totals.get("v1")).toBe(130000);
    expect(totals.has("v2")).toBe(false);
    expect(totals.has("c1")).toBe(false);
  });
  it("uses the threshold for the tax year", () => {
    expect(default1099Threshold(2025)).toBe(60000);
    expect(default1099Threshold(2026)).toBe(200000);
  });
});

describe("loanPaymentFromLines", () => {
  const loans = [
    { id: "L1", liabilityAccountId: "liab1", interestAccountId: "int" },
    { id: "L2", liabilityAccountId: "liab2", interestAccountId: "int" },
  ];
  it("reads principal and interest from a split payment", () => {
    expect(
      loanPaymentFromLines(
        [
          { accountId: "liab1", debit: 38000, credit: 0 },
          { accountId: "int", debit: 12000, credit: 0 },
          { accountId: "chk", debit: 0, credit: 50000 },
        ],
        loans
      )
    ).toEqual({ loanId: "L1", principal: 38000, interest: 12000 });
  });
  it("ignores entries that don't pay down a loan, or are ambiguous", () => {
    expect(loanPaymentFromLines([{ accountId: "rent", debit: 100, credit: 0 }, { accountId: "chk", debit: 0, credit: 100 }], loans)).toBeNull();
    // loan proceeds arriving (credit to the liability) are not a payment
    expect(loanPaymentFromLines([{ accountId: "chk", debit: 100, credit: 0 }, { accountId: "liab1", debit: 0, credit: 100 }], loans)).toBeNull();
    const shared = [...loans, { id: "L3", liabilityAccountId: "liab1", interestAccountId: "int" }];
    expect(loanPaymentFromLines([{ accountId: "liab1", debit: 100, credit: 0 }, { accountId: "chk", debit: 0, credit: 100 }], shared)).toBeNull();
  });
});
