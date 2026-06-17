import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../src/lib/db", () => ({
  prisma: {
    account: { findMany: vi.fn() },
    journalLine: { findMany: vi.fn() },
  },
}));

import { balanceSheet, profitAndLoss, trialBalance } from "../src/lib/accounting";
import { prisma } from "../src/lib/db";

type AccountFixture = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  parentId?: string | null;
  isArchived?: boolean;
};

function account(overrides: AccountFixture) {
  return {
    businessId: "biz-1",
    description: null,
    taxLine: null,
    parentId: null,
    isArchived: false,
    ...overrides,
  };
}

function line(accountId: string, debit: number, credit: number) {
  return { accountId, debit, credit };
}

function accountFindMany() {
  return prisma.account.findMany as unknown as Mock;
}

function journalLineFindMany() {
  return prisma.journalLine.findMany as unknown as Mock;
}

beforeEach(() => {
  accountFindMany().mockReset();
  journalLineFindMany().mockReset();
});

describe("profitAndLoss", () => {
  it("signs income and expense activity and rolls child expenses into parents", async () => {
    accountFindMany().mockResolvedValue([
      account({ id: "sales", code: "4000", name: "Sales", type: "INCOME" }),
      account({ id: "expenses", code: "5000", name: "Expenses", type: "EXPENSE" }),
      account({
        id: "supplies",
        code: "5010",
        name: "Supplies",
        type: "EXPENSE",
        parentId: "expenses",
      }),
    ]);
    journalLineFindMany().mockResolvedValue([
      line("sales", 0, 10000),
      line("supplies", 2500, 0),
    ]);

    const report = await profitAndLoss(
      "biz-1",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-31T00:00:00.000Z")
    );

    expect(report.totalIncome).toBe(10000);
    expect(report.totalExpenses).toBe(2500);
    expect(report.netIncome).toBe(7500);
    expect(report.income[0].own).toBe(10000);
    expect(report.expenses[0].own).toBe(0);
    expect(report.expenses[0].total).toBe(2500);
    expect(report.expenses[0].children[0].own).toBe(2500);
  });
});

describe("balanceSheet", () => {
  it("uses signed balance-sheet totals and folds lifetime net income into equity", async () => {
    accountFindMany().mockResolvedValue([
      account({ id: "cash", code: "1000", name: "Cash", type: "ASSET" }),
      account({ id: "card", code: "2000", name: "Credit Card", type: "LIABILITY" }),
      account({ id: "owner", code: "3000", name: "Owner Equity", type: "EQUITY" }),
      account({ id: "sales", code: "4000", name: "Sales", type: "INCOME" }),
      account({ id: "rent", code: "5000", name: "Rent", type: "EXPENSE" }),
    ]);
    journalLineFindMany().mockResolvedValue([
      line("cash", 15000, 0),
      line("card", 0, 4000),
      line("owner", 0, 7000),
      line("sales", 0, 6000),
      line("rent", 2000, 0),
    ]);

    const report = await balanceSheet("biz-1", new Date("2026-01-31T00:00:00.000Z"));

    expect(report.totalAssets).toBe(15000);
    expect(report.totalLiabilities).toBe(4000);
    expect(report.netIncome).toBe(4000);
    expect(report.totalEquity).toBe(11000);
    expect(report.assets[0].own).toBe(15000);
    expect(report.liabilities[0].own).toBe(4000);
    expect(report.equity[0].own).toBe(7000);
  });
});

describe("trialBalance", () => {
  it("uses cumulative balance-sheet accounts, period P&L accounts, and prior retained earnings", async () => {
    accountFindMany().mockResolvedValue([
      account({ id: "cash", code: "1000", name: "Cash", type: "ASSET" }),
      account({ id: "owner", code: "3000", name: "Owner Equity", type: "EQUITY" }),
      account({ id: "sales", code: "4000", name: "Sales", type: "INCOME" }),
      account({ id: "rent", code: "5000", name: "Rent", type: "EXPENSE" }),
    ]);
    journalLineFindMany()
      .mockResolvedValueOnce([
        line("cash", 13000, 0),
        line("owner", 0, 10000),
        line("sales", 0, 8000),
        line("rent", 5000, 0),
      ])
      .mockResolvedValueOnce([
        line("sales", 0, 3000),
        line("rent", 1000, 0),
      ]);

    const report = await trialBalance(
      "biz-1",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-31T00:00:00.000Z")
    );

    expect(report.totalDebit).toBe(14000);
    expect(report.totalCredit).toBe(14000);
    expect(report.rows.find((row) => row.account.id === "cash")).toMatchObject({
      debit: 13000,
      credit: 0,
    });
    expect(report.rows.find((row) => row.account.id === "sales")).toMatchObject({
      debit: 0,
      credit: 3000,
    });
    expect(report.rows.find((row) => row.account.id === "rent")).toMatchObject({
      debit: 1000,
      credit: 0,
    });
    expect(report.rows.find((row) => row.synthetic)).toMatchObject({
      account: { name: "Retained Earnings (prior periods)", type: "EQUITY" },
      debit: 0,
      credit: 1000,
    });
  });
});
