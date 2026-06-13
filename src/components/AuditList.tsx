import Link from "next/link";
import { formatMoney } from "../lib/money";

type AuditEventRow = {
  id: string;
  action: string;
  memo: string;
  amount: number;
  entryId: string | null;
  createdAt: Date;
};

const ACTION_STYLE: Record<string, string> = {
  CREATED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  VOIDED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  DELETED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/** Renders a list of audit events (newest first). Set `linkEntries` to link
 *  each row to its transaction (skipped for DELETED entries, which are gone). */
export function AuditList({
  events,
  linkEntries = false,
}: {
  events: AuditEventRow[];
  linkEntries?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">No history yet.</p>;
  }
  return (
    <table className="w-full">
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td className="td whitespace-nowrap">
              <span className={`badge ${ACTION_STYLE[e.action] ?? "bg-zinc-200 text-zinc-700"}`}>
                {e.action.toLowerCase()}
              </span>
            </td>
            <td className="td whitespace-nowrap text-zinc-500">
              {e.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </td>
            <td className="td">
              {linkEntries && e.entryId && e.action !== "DELETED" ? (
                <Link href={`/transactions/${e.entryId}`} className="hover:underline">
                  {e.memo}
                </Link>
              ) : (
                e.memo
              )}
            </td>
            <td className="td text-right money">{formatMoney(e.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
