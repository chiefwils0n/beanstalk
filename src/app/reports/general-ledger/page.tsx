import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { formatMoney, formatDate, parseDate, toDateInput, todayUTC } from "../../../lib/money";
import { resolvePeriod } from "../../../lib/periods";
import { contactWithDescendants } from "../../../lib/contacts";
import { ReportPeriodFields } from "../../../components/ReportPeriodFields";

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; account?: string; class?: string; contact?: string; period?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const today = todayUTC();
  const todayIso = toDateInput(today);
  // Named period wins; otherwise explicit from/to (drill links pass these, no
  // period). No "from" means all-time (balance-sheet drills need full history).
  const resolved = resolvePeriod(sp.period, sp.from, sp.to, todayIso, business.fiscalYearStart);
  const from = resolved.from ? parseDate(resolved.from) : undefined;
  const to = resolved.to ? parseDate(resolved.to) : today;

  const [accounts, classes, contacts, lines] = await Promise.all([
    prisma.account.findMany({ where: { businessId: business.id } }),
    prisma.class.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({
      where: { businessId: business.id },
      include: { type: true },
      orderBy: { name: "asc" },
    }),
    prisma.journalLine.findMany({
      where: {
        accountId: sp.account || undefined,
        // `class=none` filters to lines with no class; otherwise filter by id.
        classId: sp.class === "none" ? null : sp.class || undefined,
        // Filtering by a parent contact (e.g. a household) includes its nested contacts.
        contactId: sp.contact
          ? { in: await contactWithDescendants(business.id, sp.contact) }
          : undefined,
        entry: { businessId: business.id, status: "POSTED", date: { gte: from, lte: to } },
      },
      include: { entry: true, account: true, class: true, contact: true },
      orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }],
      take: 1000,
    }),
  ]);
  const hasClasses = classes.length > 0;
  const hasContacts = contacts.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">General Ledger</h1>
          <p className="text-sm text-zinc-500">{business.name}</p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=general-ledger${from ? `&from=${toDateInput(from)}` : ""}&to=${toDateInput(to)}${sp.account ? `&account=${sp.account}` : ""}${sp.class ? `&class=${sp.class}` : ""}${sp.contact ? `&contact=${sp.contact}` : ""}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">Account</label>
          <select name="account" defaultValue={sp.account ?? ""} className="input max-w-72">
            <option value="">All accounts</option>
            {flattenAccounts(accounts).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {hasContacts && (
          <div>
            <label className="label">Name</label>
            <select name="contact" defaultValue={sp.contact ?? ""} className="input max-w-56">
              <option value="">All names</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.type ? ` (${c.type.name.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasClasses && (
          <div>
            <label className="label">Class</label>
            <select name="class" defaultValue={sp.class ?? ""} className="input">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <ReportPeriodFields
          today={todayIso}
          fiscalStartMonth={business.fiscalYearStart}
          defaultPeriod={resolved.period}
          defaultFrom={from ? toDateInput(from) : ""}
          defaultTo={toDateInput(to)}
        />
        <button className="btn">Run report</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Account</th>
              <th className="th">Memo</th>
              {hasContacts && <th className="th">Name</th>}
              {hasClasses && <th className="th">Class</th>}
              <th className="th text-right">Debit</th>
              <th className="th text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={5 + (hasClasses ? 1 : 0) + (hasContacts ? 1 : 0)}>
                  No activity in this range.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="td whitespace-nowrap text-zinc-500">{formatDate(line.entry.date)}</td>
                <td className="td">
                  <Link
                    href={`/reports/general-ledger?account=${line.accountId}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
                    className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                    title={`Filter to ${line.account.name}`}
                  >
                    {line.account.name}
                  </Link>
                </td>
                <td className="td">
                  <Link href={`/transactions/${line.entryId}`} className="hover:underline">
                    {line.description || line.entry.memo}
                  </Link>
                </td>
                {hasContacts && (
                  <td className="td">
                    {line.contact ? (
                      <Link
                        href={`/reports/general-ledger?contact=${line.contactId}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
                        className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                        title={`Filter to ${line.contact.name}`}
                      >
                        {line.contact.name}
                      </Link>
                    ) : (
                      ""
                    )}
                  </td>
                )}
                {hasClasses && (
                  <td className="td">
                    {line.class ? (
                      <Link
                        href={`/reports/general-ledger?class=${line.classId}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
                        className="badge bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        title={`Filter to class ${line.class.name}`}
                      >
                        {line.class.name}
                      </Link>
                    ) : (
                      ""
                    )}
                  </td>
                )}
                <td className="td text-right money">{line.debit ? formatMoney(line.debit) : ""}</td>
                <td className="td text-right money">{line.credit ? formatMoney(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
