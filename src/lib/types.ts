export const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

/** Which side increases the account. */
export function normalBalance(type: string): "debit" | "credit" {
  return type === "ASSET" || type === "EXPENSE" ? "debit" : "credit";
}

/** Balance with the sign convention of the account type (positive = normal). */
export function signedBalance(type: string, debit: number, credit: number): number {
  return normalBalance(type) === "debit" ? debit - credit : credit - debit;
}

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: "day(s)",
  WEEKLY: "week(s)",
  MONTHLY: "month(s)",
  YEARLY: "year(s)",
};

export const DOCUMENT_CATEGORIES = ["RECEIPT", "CONTRACT", "INVOICE", "STATEMENT", "OTHER"] as const;

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;
