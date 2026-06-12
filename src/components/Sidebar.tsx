import Link from "next/link";
import { prisma } from "../lib/db";
import { getActiveBusiness } from "../lib/business";
import { NavLinks } from "./NavLinks";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { ThemeToggle } from "./theme";

const NAV: [string, string][] = [
  ["Dashboard", "/"],
  ["Transactions", "/transactions"],
  ["Invoices", "/invoices"],
  ["Chart of Accounts", "/accounts"],
  ["Tags", "/tags"],
  ["Classes", "/classes"],
  ["Recurring", "/recurring"],
  ["Documents", "/documents"],
  ["Reports", "/reports"],
  ["Businesses", "/businesses"],
];

export async function Sidebar() {
  const [businesses, active] = await Promise.all([
    prisma.business.findMany({ orderBy: { createdAt: "asc" } }),
    getActiveBusiness(),
  ]);
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="flex items-center gap-2 px-1 text-lg font-bold">
        <span className="text-emerald-600">🌱</span> Beanstalk
      </Link>
      <BusinessSwitcher
        businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
        activeId={active?.id ?? null}
      />
      <NavLinks items={NAV} />
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}
