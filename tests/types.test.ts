import { describe, it, expect } from "vitest";
import { normalBalance, signedBalance } from "../src/lib/types";

describe("account sign conventions", () => {
  it("assets and expenses are debit-normal; the rest credit-normal", () => {
    expect(normalBalance("ASSET")).toBe("debit");
    expect(normalBalance("EXPENSE")).toBe("debit");
    expect(normalBalance("LIABILITY")).toBe("credit");
    expect(normalBalance("EQUITY")).toBe("credit");
    expect(normalBalance("INCOME")).toBe("credit");
  });

  it("signs balances by the account's normal side", () => {
    // a debit-normal account: debit increases, credit decreases
    expect(signedBalance("ASSET", 10000, 3000)).toBe(7000);
    expect(signedBalance("EXPENSE", 500, 0)).toBe(500);
    // a credit-normal account: credit increases, debit decreases
    expect(signedBalance("INCOME", 0, 10000)).toBe(10000);
    expect(signedBalance("LIABILITY", 2000, 5000)).toBe(3000);
  });
});
