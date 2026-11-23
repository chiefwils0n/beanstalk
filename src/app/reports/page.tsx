import Link from "next/link";
import { requireBusiness } from "../../lib/business";

const REPORTS = [
  {
    href: "/reports/profit-loss",
    title: "Profit & Loss",
    description: "Income and expenses over a period, with net income.",
  },
  {
    href: "/reports/profit-loss-by-class",
    title: "Profit & Loss by Class",
    description: "Income and expenses with each class as a side-by-side column.",
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity as of a date.",
  },
  {
    href: "/reports/trial-balance",
    title: "Trial Balance",
    description: "Debit and credit totals for every account — verify the books balance.",
  },
  {
    href: "/reports/general-ledger",
    title: "General Ledger",
    description: "Every posted line, filterable by account and date.",
  },
  {
    href: "/reports/cash-flow",
    title: "Cash Flow Statement",
    description: "Where cash came from and went: operating, investing, and financing.",
  },
  {
    href: "/reports/receivables-ageing",
    title: "Receivables Ageing",
    description: "Unpaid invoices by customer and how overdue they are.",
  },
  {
    href: "/reports/payables-ageing",
    title: "Payables Ageing",
    description: "Unpaid bills by vendor and how overdue they are.",
  },
  {
    href: "/reports/budget-vs-actual",
    title: "Budget vs. Actual",
    description: "Income and expenses against the monthly budget you set.",
  },
  {
    href: "/reports/vendor-payments",
    title: "1099 Vendor Payments",
    description: "Cash paid to each vendor for the year, flagged at the 1099 threshold.",
  },
  {
    href: "/reports/tax-summary",
    title: "Tax Summary",
    description: "Income and deductible expenses grouped by tax line for your accountant.",
  },
];

export default async function ReportsPage() {
  await requireBusiness();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Reports</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href} className="card hover:border-emerald-400 dark:hover:border-emerald-600">
            <h2 className="font-semibold">{report.title}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
