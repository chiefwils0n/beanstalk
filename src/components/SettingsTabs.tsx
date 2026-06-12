"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: [string, string][] = [
  ["Businesses", "/settings/businesses"],
  ["Tags", "/settings/tags"],
  ["Classes", "/settings/classes"],
  ["Contact types", "/settings/contact-types"],
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-3 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {TABS.map(([label, href]) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium ${
              active
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
