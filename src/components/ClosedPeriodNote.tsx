import Link from "next/link";
import { formatDate } from "../lib/money";

/** Shown in place of Void/Delete when a record is dated in a closed period. */
export function ClosedPeriodNote({ lockDate }: { lockDate: Date }) {
  return (
    <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      🔒 Closed period —{" "}
      <Link href="/settings/closing" className="underline">
        books closed through {formatDate(lockDate)}
      </Link>
    </span>
  );
}
