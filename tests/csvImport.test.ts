import { describe, it, expect } from "vitest";
import {
  buildImportRows,
  detectColumns,
  entryLinesForRow,
  findRepeatsInFile,
  looksLikeHeader,
  matchExistingLines,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
} from "../src/lib/csvImport";
import { checkBalanced } from "../src/lib/ledger";

describe("parseCsv", () => {
  it("handles a BOM, CRLF, quotes, escaped quotes and embedded commas/newlines", () => {
    const text = '﻿Date,Description,Amount\r\n01/02/2026,"Acme, Inc. ""HQ""",12.50\r\n01/03/2026,"line one\nline two",-3\r\n';
    expect(parseCsv(text)).toEqual([
      ["Date", "Description", "Amount"],
      ["01/02/2026", 'Acme, Inc. "HQ"', "12.50"],
      ["01/03/2026", "line one\nline two", "-3"],
    ]);
  });

  it("drops blank lines and keeps a last row with no trailing newline", () => {
    expect(parseCsv("a,b\n\n,\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvDate", () => {
  it("reads US, ISO and two-digit-year dates", () => {
    expect(parseCsvDate("06/09/2026")).toBe("2026-06-09");
    expect(parseCsvDate("6/9/26")).toBe("2026-06-09");
    expect(parseCsvDate("2026-06-09")).toBe("2026-06-09");
    expect(parseCsvDate("2026-06-09T14:03:00")).toBe("2026-06-09");
  });

  it("honors day-first format", () => {
    expect(parseCsvDate("09/06/2026", "DMY")).toBe("2026-06-09");
  });

  it("rejects impossible or non-date values", () => {
    expect(parseCsvDate("02/30/2026")).toBeNull();
    expect(parseCsvDate("13/01/2026")).toBeNull();
    expect(parseCsvDate("Pending")).toBeNull();
    expect(parseCsvDate("")).toBeNull();
  });
});

describe("parseCsvAmount", () => {
  it("returns signed integer cents", () => {
    expect(parseCsvAmount("542.44")).toBe(54244);
    expect(parseCsvAmount("$1,196.00")).toBe(119600);
    expect(parseCsvAmount("-95")).toBe(-9500);
    expect(parseCsvAmount("(12.00)")).toBe(-1200);
    expect(parseCsvAmount("12.00-")).toBe(-1200);
    expect(parseCsvAmount("12.00 DR")).toBe(-1200);
    expect(parseCsvAmount("12.00CR")).toBe(1200);
    expect(parseCsvAmount(".5")).toBe(50);
  });

  it("is exact where float math is not", () => {
    // 1.005 * 100 = 100.49999999999999 in floating point
    expect(parseCsvAmount("1.005")).toBe(101);
    expect(parseCsvAmount("0.29")).toBe(29);
    expect(parseCsvAmount("4.35")).toBe(435);
  });

  it("rejects non-numbers", () => {
    expect(parseCsvAmount("")).toBeNull();
    expect(parseCsvAmount("n/a")).toBeNull();
    expect(parseCsvAmount("1.2.3")).toBeNull();
    expect(parseCsvAmount("-")).toBeNull();
  });
});

const BANK_HEADER = [
  "Posting Date",
  "Transaction Date",
  "Amount",
  "Credit Debit Indicator",
  "type",
  "Reference",
  "Instructed Amount",
  "Description",
  "Category",
  "Check Serial Number",
];

describe("detectColumns", () => {
  it("maps an amount + Credit/Debit indicator export", () => {
    const m = detectColumns(BANK_HEADER);
    expect(m.mode).toBe("indicator");
    expect(BANK_HEADER[m.date]).toBe("Transaction Date");
    expect(BANK_HEADER[m.amount]).toBe("Amount");
    expect(BANK_HEADER[m.indicator]).toBe("Credit Debit Indicator");
    expect(BANK_HEADER[m.description]).toBe("Description");
    expect(BANK_HEADER[m.reference]).toBe("Check Serial Number");
  });

  it("maps separate debit / credit columns", () => {
    const m = detectColumns(["Date", "Payee", "Debit", "Credit", "Balance"]);
    expect(m.mode).toBe("split");
    expect([m.date, m.description, m.moneyOut, m.moneyIn]).toEqual([0, 1, 2, 3]);
  });

  it("maps a single signed amount column", () => {
    const m = detectColumns(["Date", "Description", "Amount"]);
    expect(m.mode).toBe("signed");
    expect(m.amount).toBe(2);
    expect(m.reference).toBe(-1);
  });
});

describe("looksLikeHeader", () => {
  it("tells names from data", () => {
    expect(looksLikeHeader(BANK_HEADER)).toBe(true);
    expect(looksLikeHeader(["06/09/2026", "Transfer", "542.44"])).toBe(false);
  });
});

describe("buildImportRows", () => {
  it("signs amounts from a Credit/Debit indicator", () => {
    const mapping = detectColumns(BANK_HEADER);
    const data = [
      ["06/11/2026", "06/11/2026", "95.00", "Debit", "Check", "", "", "Paid Check 5171", "Checks", "5171"],
      ["06/09/2026", "06/09/2026", "1196.00", "Credit", "ACH Credit", "", "", "Deposit  Herring Rental", "Pay", ""],
    ];
    expect(buildImportRows(data, mapping)).toEqual({
      rows: [
        { line: 1, date: "2026-06-11", description: "Paid Check 5171", reference: "5171", amount: -9500 },
        { line: 2, date: "2026-06-09", description: "Deposit Herring Rental", reference: "", amount: 119600 },
      ],
      errors: [],
    });
  });

  it("nets separate in / out columns and can flip signs", () => {
    const mapping = detectColumns(["Date", "Payee", "Debit", "Credit"]);
    const data = [
      ["2026-01-05", "Rent", "1,200.00", ""],
      ["2026-01-06", "Refund", "", "40.00"],
    ];
    expect(buildImportRows(data, mapping).rows.map((r) => r.amount)).toEqual([-120000, 4000]);
    expect(buildImportRows(data, { ...mapping, flipSign: true }).rows.map((r) => r.amount)).toEqual([120000, -4000]);
  });

  it("reports unreadable rows instead of guessing", () => {
    const mapping = detectColumns(["Date", "Description", "Amount"]);
    const { rows, errors } = buildImportRows(
      [
        ["01/05/2026", "ok", "10.00"],
        ["Pending", "no date", "10.00"],
        ["01/06/2026", "no amount", "abc"],
        ["01/07/2026", "zero", "0.00"],
      ],
      mapping
    );
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("rejects an indicator it can't interpret", () => {
    const mapping = detectColumns(BANK_HEADER);
    const { rows, errors } = buildImportRows(
      [["06/11/2026", "06/11/2026", "95.00", "???", "", "", "", "x", "", ""]],
      mapping
    );
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/money in from money out/);
  });
});

describe("findRepeatsInFile", () => {
  it("flags later rows with the same date and amount", () => {
    const repeats = findRepeatsInFile([
      { date: "2026-01-09", amount: 119600 },
      { date: "2026-01-09", amount: 119600 },
      { date: "2026-01-09", amount: -119600 },
      { date: "2026-01-10", amount: 119600 },
    ]);
    expect([...repeats]).toEqual([1]);
  });
});

describe("matchExistingLines", () => {
  const ledger = [
    { id: "a", date: "2026-06-09", debit: 0, credit: 54244 },
    { id: "b", date: "2026-06-12", debit: 0, credit: 54244 },
    { id: "c", date: "2026-06-01", debit: 119600, credit: 0 },
  ];

  it("matches money out to credits and money in to debits", () => {
    const m = matchExistingLines([{ date: "2026-06-09", amount: -54244 }, { date: "2026-06-02", amount: 119600 }], ledger);
    expect(m.get(0)).toBe("a");
    expect(m.get(1)).toBe("c");
  });

  it("never matches the wrong side", () => {
    expect(matchExistingLines([{ date: "2026-06-09", amount: 54244 }], ledger).size).toBe(0);
  });

  it("uses each ledger line once, exact dates first", () => {
    const m = matchExistingLines(
      [
        { date: "2026-06-11", amount: -54244 }, // near both; must not steal "a" from the exact match
        { date: "2026-06-09", amount: -54244 },
        { date: "2026-06-10", amount: -54244 }, // nothing left
      ],
      ledger
    );
    expect(m.get(1)).toBe("a");
    expect(m.get(0)).toBe("b");
    expect(m.has(2)).toBe(false);
  });

  it("ignores lines outside the date tolerance", () => {
    expect(matchExistingLines([{ date: "2026-06-20", amount: -54244 }], ledger).size).toBe(0);
  });
});

describe("entryLinesForRow", () => {
  it("debits the account for money in and credits it for money out, always balanced", () => {
    const moneyIn = entryLinesForRow(119600, "bank", "income");
    const moneyOut = entryLinesForRow(-9500, "bank", "expense");
    if ("error" in moneyIn || "error" in moneyOut) throw new Error("expected lines");
    expect(moneyIn.lines).toEqual([
      { accountId: "bank", debit: 119600, credit: 0 },
      { accountId: "income", debit: 0, credit: 119600 },
    ]);
    expect(moneyOut.lines).toEqual([
      { accountId: "expense", debit: 9500, credit: 0 },
      { accountId: "bank", debit: 0, credit: 9500 },
    ]);
    expect(checkBalanced(moneyIn.lines)).toBeNull();
    expect(checkBalanced(moneyOut.lines)).toBeNull();
  });

  it("rejects zero, fractional-cent, self-category and missing-category rows", () => {
    expect(entryLinesForRow(0, "bank", "x")).toHaveProperty("error");
    expect(entryLinesForRow(10.5, "bank", "x")).toHaveProperty("error");
    expect(entryLinesForRow(100, "bank", "bank")).toHaveProperty("error");
    expect(entryLinesForRow(100, "bank", "")).toHaveProperty("error");
  });
});
