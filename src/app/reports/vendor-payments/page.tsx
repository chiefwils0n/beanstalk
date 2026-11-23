import Link from "next/link";
import { requireBusiness } from "../../../lib/business";
import { vendorPaymentTotals } from "../../../lib/reports";
import { default1099Threshold } from "../../../lib/vendorPayments";
import { formatMoney, parseMoney, todayUTC } from "../../../lib/money";

export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; threshold?: string; type?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const currentYear = todayUTC().getUTCFullYear();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : currentYear;
  let threshold = default1099Threshold(year);
  if (sp.threshold) {
    try {
      const custom = parseMoney(sp.threshold);
      if (custom > 0) threshold = custom;
    } catch {
      // keep the default
    }
  }
  const report = await vendorPaymentTotals(business.id, year);
  const types = [...new Set(report.rows.map((r) => r.typeName ?? "No type"))].sort();
  const typeFilter = sp.type ?? "";
  const rows = report.rows.filter((r) => !typeFilter || (r.typeName ?? "No type") === typeFilter);
  const over = rows.filter((r) => r.paid >= threshold);
  const under = rows.filter((r) => r.paid < threshold);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const missing = (r: (typeof rows)[number]) => !r.contact.address || !r.contact.zip;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports" className="text-sm text-emerald-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="page-title mt-1">1099 Vendor Payments — {year}</h1>
          <p className="text-sm text-zinc-500">
            {business.name} · cash paid to each contact, flagged at {formatMoney(threshold)} or more
          </p>
        </div>
        <a
          className="btn btn-sm"
          href={`/api/export?report=vendor-payments&year=${year}&threshold=${threshold / 100}${typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : ""}`}
        >
          Export CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label className="label">Tax year</label>
          <select name="year" defaultValue={String(year)} className="input">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Contact type</label>
          <select name="type" defaultValue={typeFilter} className="input">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Threshold ($)</label>
          <input
            name="threshold"
            inputMode="decimal"
            className="input w-28 text-right"
            placeholder={(default1099Threshold(year) / 100).toFixed(0)}
            defaultValue={sp.threshold ?? ""}
          />
        </div>
        <button className="btn">Run report</button>
      </form>

      {!report.hasCashAccounts && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          No account is marked as cash, so no payments can be found. Open your bank accounts in the
          Chart of Accounts and set &ldquo;Cash flow statement&rdquo; to &ldquo;Cash &amp; bank&rdquo;.
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Contact</th>
              <th className="th">Type</th>
              <th className="th">Mailing address</th>
              <th className="th text-right">Paid in {year}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 font-bold dark:bg-amber-950/40" colSpan={4}>
                At or over the threshold ({over.length})
              </td>
            </tr>
            {over.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={4}>
                  Nobody was paid {formatMoney(threshold)} or more in {year}.
                </td>
              </tr>
            )}
            {over.map((r) => (
              <tr key={r.contact.id}>
                <td className="td font-medium">
                  <Link href={`/contacts/${r.contact.id}`} className="hover:underline">
                    {r.contact.name}
                  </Link>
                </td>
                <td className="td text-zinc-500">{r.typeName ?? ""}</td>
                <td className="td text-sm text-zinc-500">
                  {missing(r) ? (
                    <span className="text-amber-700 dark:text-amber-300">Address incomplete</span>
                  ) : (
                    [r.contact.address, r.contact.city, r.contact.state, r.contact.zip].filter(Boolean).join(", ")
                  )}
                </td>
                <td className="td text-right money font-medium">{formatMoney(r.paid)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td className="td font-semibold" colSpan={3}>
                Total at or over the threshold
              </td>
              <td className="td text-right money font-semibold">{formatMoney(over.reduce((s, r) => s + r.paid, 0))}</td>
            </tr>
            <tr aria-hidden>
              <td colSpan={4} className="h-3" />
            </tr>
            <tr>
              <td className="border-l-4 border-l-slate-500 bg-slate-100 px-3 py-2 font-bold dark:bg-slate-800/40" colSpan={4}>
                Under the threshold ({under.length})
              </td>
            </tr>
            {under.map((r) => (
              <tr key={r.contact.id}>
                <td className="td">
                  <Link href={`/contacts/${r.contact.id}`} className="hover:underline">
                    {r.contact.name}
                  </Link>
                </td>
                <td className="td text-zinc-500">{r.typeName ?? ""}</td>
                <td className="td" />
                <td className="td text-right money">{formatMoney(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        Counts money that left a cash or bank account for a transaction line naming the contact —
        including payments on bills, but not unpaid bills and not anything paid by credit card (the
        card processor reports those). The federal 1099-NEC/MISC threshold is $600 for payments
        through 2025 and $2,000 for 2026, indexed for inflation afterwards. Whether a payee actually
        needs a 1099 depends on what was paid for and how they are organised (most corporations are
        exempt), so treat this as a worklist for your tax preparer, not a filing.
      </p>
    </div>
  );
}
