import { describe, it, expect } from "vitest";
import { checkBalanced } from "../src/lib/ledger";

describe("checkBalanced — the double-entry invariant", () => {
  it("accepts a balanced two-line entry", () => {
    expect(checkBalanced([{ debit: 1000, credit: 0 }, { debit: 0, credit: 1000 }])).toBeNull();
  });

  it("accepts a balanced split (multi-line)", () => {
    expect(
      checkBalanced([
        { debit: 2000, credit: 0 },
        { debit: 0, credit: 1200 },
        { debit: 0, credit: 800 },
      ])
    ).toBeNull();
  });

  it("rejects fewer than two lines", () => {
    expect(checkBalanced([{ debit: 1000, credit: 0 }])).toMatch(/at least two/);
  });

  it("rejects an out-of-balance entry", () => {
    expect(checkBalanced([{ debit: 1000, credit: 0 }, { debit: 0, credit: 900 }])).toMatch(
      /out of balance/
    );
  });

  it("rejects a one-cent imbalance", () => {
    expect(checkBalanced([{ debit: 1001, credit: 0 }, { debit: 0, credit: 1000 }])).toContain(
      "debits 1001"
    );
  });

  it("keeps large integer-cent totals exact", () => {
    expect(
      checkBalanced([
        { debit: Number.MAX_SAFE_INTEGER, credit: 0 },
        { debit: 0, credit: Number.MAX_SAFE_INTEGER },
      ])
    ).toBeNull();
  });

  it("rejects negative amounts", () => {
    expect(checkBalanced([{ debit: -1000, credit: 0 }, { debit: 0, credit: -1000 }])).toMatch(
      /must be positive/
    );
  });

  it("rejects a line with both a debit and a credit", () => {
    expect(checkBalanced([{ debit: 500, credit: 500 }, { debit: 0, credit: 500 }])).toMatch(
      /debit or a credit/
    );
  });
});
