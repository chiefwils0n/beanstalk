/**
 * Statement of cash flows (indirect method), as pure functions.
 *
 * Every account is placed in one section. Cash accounts are what the statement
 * explains; the change in every other balance-sheet account is a source or use
 * of cash. Because every entry balances, the three sections always add up to
 * the change in cash.
 *
 * An account's section comes from, in order: its own `cashFlow` setting, the
 * nearest ancestor's setting, then a guess from the account type and name.
 * Amounts are integer cents.
 */

export const CASH_FLOW_SECTIONS = ["CASH", "OPERATING", "INVESTING", "FINANCING"] as const;
export type CashFlowSection = (typeof CASH_FLOW_SECTIONS)[number];

export const CASH_FLOW_LABELS: Record<CashFlowSection, string> = {
  CASH: "Cash & bank",
  OPERATING: "Operating",
  INVESTING: "Investing",
  FINANCING: "Financing",
};

export type CashFlowAccount = {
  id: string;
  name: string;
  code?: string | null;
  type: string;
  parentId: string | null;
  cashFlow: string | null;
};

export type CashFlowHints = {
  /** Accounts known to be bank accounts (reconciled, or imported into). */
  cashIds?: Set<string>;
  /** Liability accounts that carry a loan. */
  loanLiabilityIds?: Set<string>;
};

const CASH_NAME = /\b(cash|bank|checking|savings|money market|undeposited)\b/i;
const NOT_CASH_NAME = /receivable|payable/i;
const FIXED_NAME =
  /equipment|vehicle|building|land\b|property|furniture|improvement|depreciation|fixed asset|investment|machinery|real estate/i;
const DEBT_NAME = /loan|mortgage|note payable|notes payable|line of credit|heloc/i;

function isSection(value: string | null): value is CashFlowSection {
  return CASH_FLOW_SECTIONS.includes(value as CashFlowSection);
}

/** Section for every account id. */
export function classifyAccounts(
  accounts: CashFlowAccount[],
  hints: CashFlowHints = {}
): Map<string, CashFlowSection> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  // An account followed by its ancestors, nearest first (cycle-safe).
  const chain = (account: CashFlowAccount): CashFlowAccount[] => {
    const out: CashFlowAccount[] = [];
    const seen = new Set<string>();
    let cur: CashFlowAccount | undefined = account;
    while (cur && !seen.has(cur.id)) {
      out.push(cur);
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  };
  const result = new Map<string, CashFlowSection>();
  for (const account of accounts) {
    const line = chain(account);
    const explicit = line.find((a) => isSection(a.cashFlow));
    if (explicit) {
      // Only an asset can be cash, whatever a parent says.
      const section = explicit.cashFlow as CashFlowSection;
      result.set(account.id, section === "CASH" && account.type !== "ASSET" ? "OPERATING" : section);
      continue;
    }
    let section: CashFlowSection = "OPERATING";
    if (account.type === "EQUITY") {
      section = "FINANCING";
    } else if (account.type === "LIABILITY") {
      const debt = line.some((a) => hints.loanLiabilityIds?.has(a.id) || DEBT_NAME.test(a.name));
      section = debt ? "FINANCING" : "OPERATING";
    } else if (account.type === "ASSET") {
      const cash =
        hints.cashIds?.has(account.id) ||
        (!NOT_CASH_NAME.test(account.name) && line.some((a) => CASH_NAME.test(a.name)));
      if (cash) section = "CASH";
      else if (line.some((a) => FIXED_NAME.test(a.name))) section = "INVESTING";
    }
    result.set(account.id, section);
  }
  return result;
}

type Raw = { debit: number; credit: number };
export type CashFlowRow = { accountId: string; name: string; code: string | null; amount: number };

/**
 * Build the statement. `opening` holds each account's totals before the period
 * starts, `period` its totals within the period. A row's amount is its effect
 * on cash: positive = cash came in.
 */
export function buildCashFlow(
  accounts: CashFlowAccount[],
  sections: Map<string, CashFlowSection>,
  opening: Map<string, Raw>,
  period: Map<string, Raw>
) {
  const zero: Raw = { debit: 0, credit: 0 };
  const rows: Record<Exclude<CashFlowSection, "CASH">, CashFlowRow[]> = {
    OPERATING: [],
    INVESTING: [],
    FINANCING: [],
  };
  let cashStart = 0;
  let cashChange = 0;
  let netIncome = 0;
  for (const account of accounts) {
    const open = opening.get(account.id) ?? zero;
    const move = period.get(account.id) ?? zero;
    if (account.type === "INCOME" || account.type === "EXPENSE") {
      netIncome += move.credit - move.debit;
      continue;
    }
    const section = sections.get(account.id) ?? "OPERATING";
    if (section === "CASH") {
      cashStart += open.debit - open.credit;
      cashChange += move.debit - move.credit;
      continue;
    }
    const amount = move.credit - move.debit;
    if (amount !== 0) rows[section].push({ accountId: account.id, name: account.name, code: account.code ?? null, amount });
  }
  const sortRows = (list: CashFlowRow[]) =>
    list.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
  const sum = (list: CashFlowRow[]) => list.reduce((s, r) => s + r.amount, 0);
  const operating = netIncome + sum(rows.OPERATING);
  const investing = sum(rows.INVESTING);
  const financing = sum(rows.FINANCING);
  return {
    netIncome,
    adjustments: sortRows(rows.OPERATING),
    investingRows: sortRows(rows.INVESTING),
    financingRows: sortRows(rows.FINANCING),
    operating,
    investing,
    financing,
    netChange: operating + investing + financing,
    cashStart,
    cashChange,
    cashEnd: cashStart + cashChange,
    /** Non-zero only if the ledger itself is out of balance. */
    unexplained: cashChange - (operating + investing + financing),
  };
}
