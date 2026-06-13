import Link from "next/link";
import { prisma } from "../lib/db";
import { getActiveBusiness } from "../lib/business";
import { NavLinks } from "./NavLinks";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { ThemeToggle } from "./theme";
import { authEnabled } from "../lib/auth";
import { logoutAction } from "../lib/actions";

const NAV_MAIN: [string, string][] = [
  ["Chart of Accounts", "/accounts"],
  ["Contacts", "/contacts"],
  ["Documents", "/documents"],
  ["Invoices", "/invoices"],
  ["Loans", "/loans"],
  ["Reconcile", "/reconcile"],
  ["Reports", "/reports"],
  ["Transactions", "/transactions"],
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
      <div className="flex flex-col gap-0.5">
        <NavLinks items={[["Dashboard", "/"]]} />
        <hr className="my-2 border-zinc-200 dark:border-zinc-800" />
        <NavLinks items={NAV_MAIN} />
        <hr className="my-2 border-zinc-200 dark:border-zinc-800" />
        <NavLinks items={[["Settings", "/settings"]]} />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <ThemeToggle />
        {authEnabled() && (
          <form action={logoutAction}>
            <button className="btn btn-sm w-full">Log out</button>
          </form>
        )}
      </div>
    </aside>
  );
}
