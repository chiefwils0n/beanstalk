import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { requireBusiness, TXN_FILTER_COOKIE } from "../../lib/business";
import { applyTransactionFilter, clearTransactionFilter } from "../../lib/actions";
import { flattenAccounts } from "../../lib/accounting";
import { flattenContacts, contactWithDescendants } from "../../lib/contacts";
import { formatMoney, formatDate, parseDate, parseMoney, toDateInput, todayUTC } from "../../lib/money";
import { resolvePeriod } from "../../lib/periods";
import { ReportPeriodFields } from "../../components/ReportPeriodFields";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    tag?: string;
    q?: string;
    account?: string;
    class?: string;
    contact?: string;
    amount?: string;
    period?: string;
    n?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const { tag, q, account, class: classFilter, contact, amount } = sp;

  // Reporting-period preset → effective From/To. A named period is recomputed
  // each load (so "this month to date" stays current); "custom" uses the
  // explicit dates. Both persist in the filter cookie.
  const todayIso = toDateInput(todayUTC());
  const resolved = resolvePeriod(sp.period, sp.from, sp.to, todayIso, business.fiscalYearStart, sp.n ? Number(sp.n) : undefined);
  const fromDate = resolved.from ? parseDate(resolved.from) : undefined;
  const toDate = resolved.to ? parseDate(resolved.to) : undefined;

  const SORT_COLS = ["date", "memo", "accounts", "amount", "status"] as const;
  type SortCol = (typeof SORT_COLS)[number];
  const sort: SortCol = (SORT_COLS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as SortCol)
    : "date";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  // Build a header link that preserves the current filter and toggles direction.
  const sortHref = (col: SortCol) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "sort" && k !== "dir") params.set(k, String(v));
    }
    params.set("sort", col);
    params.set("dir", sort === col && dir === "asc" ? "desc" : "asc");
    return `/transactions?${params.toString()}`;
  };

  // Filter persists across visits: arriving with no params restores the last
  // saved filter (cleared via the Clear button, which deletes the cookie).
  const hasParams = Object.values(sp).some(Boolean);
  if (!hasParams) {
    const saved = (await cookies()).get(TXN_FILTER_COOKIE)?.value;
    if (saved) redirect(`/transactions?${saved}`);
  }

  let amountCents: number | null = null;
  try {
    amountCents = amount ? parseMoney(amount) : null;
  } catch {
    amountCents = null;
  }

  // Filtering by a contact includes its nested contacts (e.g. a household's tenants).
  const contactIds = contact ? await contactWithDescendants(business.id, contact) : null;

  // Line-level filters are independent: an entry matches if it has a line on
  // the account AND a line with the class AND a line for the name AND a line
  // equal to the amount.
  const lineConditions = [
    account ? { lines: { some: { accountId: account } } } : null,
    classFilter ? { lines: { some: { classId: classFilter } } } : null,
    contactIds ? { lines: { some: { contactId: { in: contactIds } } } } : null,
    amountCents !== null
      ? { lines: { some: { OR: [{ debit: amountCents }, { credit: amountCents }] } } }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const [entries, tags, accounts, classes, contacts] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        businessId: business.id,
        date: { gte: fromDate, lte: toDate },
        tags: tag ? { some: { tagId: tag } } : undefined,
        memo: q ? { contains: q } : undefined,
        AND: lineConditions,
      },
      orderBy:
        sort === "memo"
          ? [{ memo: dir }, { date: "desc" }]
          : sort === "date"
            ? [{ date: dir }, { createdAt: dir }]
            : [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { lines: { include: { account: true } }, tags: { include: { tag: true } } },
    }),
    prisma.tag.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { businessId: business.id } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({
      where: { businessId: business.id },
      include: { type: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Precompute the derived display values, then sort by the chosen column.
  // Reconcile status is per account: when filtered to an account, judge only
  // that account's line(s); otherwise across all legs.
  const rows = entries.map((entry) => {
    const amount = entry.lines.reduce((s, l) => s + l.debit, 0);
    const accountsLabel = [...new Set(entry.lines.map((l) => l.account.name))].join(", ");
    let status: "void" | "R" | "C" | "" = "";
    if (entry.status === "VOID") status = "void";
    else {
      const relevant = account ? entry.lines.filter((l) => l.accountId === account) : entry.lines;
      if (relevant.some((l) => l.cleared === "RECONCILED")) status = "R";
      else if (relevant.some((l) => l.cleared === "CLEARED")) status = "C";
    }
    return { entry, amount, accountsLabel, status };
  });
  const flip = dir === "asc" ? 1 : -1;
  if (sort === "amount") rows.sort((a, b) => flip * (a.amount - b.amount));
  else if (sort === "accounts") rows.sort((a, b) => flip * a.accountsLabel.localeCompare(b.accountsLabel));
  else if (sort === "status") {
    const rank = { void: 0, "": 1, C: 2, R: 3 };
    rows.sort((a, b) => flip * (rank[a.status] - rank[b.status]));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Transactions</h1>
        <Link href="/transactions/new" className="btn btn-primary">
          + New transaction
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3" action={applyTransactionFilter}>
        <ReportPeriodFields
          today={todayIso}
          fiscalStartMonth={business.fiscalYearStart}
          defaultPeriod={resolved.period}
          defaultFrom={resolved.from ?? ""}
          defaultTo={resolved.to ?? ""}
          defaultN={resolved.n}
        />
        <div>
          <label className="label">Account</label>
          <select name="account" defaultValue={account ?? ""} className="input max-w-64">
            <option value="">All accounts</option>
            {flattenAccounts(accounts).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {classes.length > 0 && (
          <div>
            <label className="label">Class</label>
            <select name="class" defaultValue={classFilter ?? ""} className="input">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {contacts.length > 0 && (
          <div>
            <label className="label">Name</label>
            <select name="contact" defaultValue={contact ?? ""} className="input max-w-56">
              <option value="">All names</option>
              {flattenContacts(contacts).map((c) => (
                <option key={c.id} value={c.id}>
                  {" ".repeat(c.depth * 2)}
                  {c.name}
                  {c.typeName ? ` (${c.typeName.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Tag</label>
          <select name="tag" defaultValue={tag ?? ""} className="input">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input
            name="amount"
            defaultValue={amount}
            className="input w-28 text-right"
            inputMode="decimal"
            placeholder="e.g. 542.44"
          />
        </div>
        <div>
          <label className="label">Search memo</label>
          <input name="q" defaultValue={q} className="input" placeholder="Search…" />
        </div>
        <button className="btn">Filter</button>
        <button formAction={clearTransactionFilter} className="btn">
          Clear
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              {([
                { col: "date", label: "Date", justify: "justify-start" },
                { col: "memo", label: "Memo", justify: "justify-start" },
                { col: "accounts", label: "Accounts", justify: "justify-start" },
                { col: "amount", label: "Amount", justify: "justify-end" },
                { col: "status", label: "Status", justify: "justify-center" },
              ] as const).map(({ col, label, justify }) => {
                const active = sort === col;
                return (
                  <th key={col} className="th">
                    <Link
                      href={sortHref(col)}
                      className={`flex items-center gap-1 ${justify} hover:text-emerald-600 dark:hover:text-emerald-400 ${active ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                    >
                      {label}
                      <span className={active ? "" : "text-zinc-300 dark:text-zinc-600"}>
                        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={5}>
                  No transactions found.
                </td>
              </tr>
            )}
            {rows.map(({ entry, amount, accountsLabel, status }) => (
              <tr key={entry.id} className={entry.status === "VOID" ? "opacity-50" : ""}>
                <td className="td whitespace-nowrap text-zinc-500">{formatDate(entry.date)}</td>
                <td className="td">
                  <Link href={`/transactions/${entry.id}`} className="font-medium hover:underline">
                    {entry.memo}
                  </Link>
                  {entry.reference && (
                    <span className="ml-2 text-xs text-zinc-400">#{entry.reference}</span>
                  )}
                  {entry.tags.map(({ tag: t }) => (
                    <span key={t.id} className="badge ml-1.5 text-white" style={{ backgroundColor: t.color }}>
                      {t.name}
                    </span>
                  ))}
                </td>
                <td className="td text-xs text-zinc-500">{accountsLabel}</td>
                <td className="td text-right money">{formatMoney(amount)}</td>
                <td className="td text-center">
                  {status === "void" && (
                    <span className="badge bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      void
                    </span>
                  )}
                  {status === "R" && (
                    <span
                      className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      title={account ? "Reconciled" : "Reconciled on a bank/card statement"}
                    >
                      R
                    </span>
                  )}
                  {status === "C" && (
                    <span
                      className="badge bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      title="Cleared (reconciliation in progress)"
                    >
                      C
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
