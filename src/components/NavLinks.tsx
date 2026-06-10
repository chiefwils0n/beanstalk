"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: [string, string][] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(([label, href]) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
