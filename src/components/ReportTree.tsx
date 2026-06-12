import Link from "next/link";
import { formatMoney } from "../lib/money";
import type { AccountNode } from "../lib/accounting";

export type DrillRange = { from?: string; to?: string; classId?: string };

/** Link into the General Ledger filtered to one account over the report's range. */
export function ledgerHref(accountId: string, drill?: DrillRange): string {
  const params = new URLSearchParams({ account: accountId });
  if (drill?.from) params.set("from", drill.from);
  if (drill?.to) params.set("to", drill.to);
  if (drill?.classId) params.set("class", drill.classId);
  return `/reports/general-ledger?${params.toString()}`;
}

export function ReportTreeRows({
  nodes,
  depth = 0,
  hideZero = true,
  drill,
}: {
  nodes: AccountNode[];
  depth?: number;
  hideZero?: boolean;
  drill?: DrillRange;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (hideZero && node.total === 0 && node.children.length === 0) return null;
        return (
          <ReportTreeRow key={node.account.id} node={node} depth={depth} hideZero={hideZero} drill={drill} />
        );
      })}
    </>
  );
}

function ReportTreeRow({
  node,
  depth,
  hideZero,
  drill,
}: {
  node: AccountNode;
  depth: number;
  hideZero: boolean;
  drill?: DrillRange;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <>
      <tr>
        <td className="td" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          {node.account.code && (
            <span className="mr-2 font-mono text-xs text-zinc-400">{node.account.code}</span>
          )}
          <Link
            href={ledgerHref(node.account.id, drill)}
            className={`hover:text-emerald-600 hover:underline dark:hover:text-emerald-400 ${hasChildren ? "font-medium" : ""}`}
          >
            {node.account.name}
          </Link>
        </td>
        <td className="td text-right font-mono">{formatMoney(hasChildren ? node.own : node.total)}</td>
      </tr>
      <ReportTreeRows nodes={node.children} depth={depth + 1} hideZero={hideZero} drill={drill} />
      {hasChildren && (
        <tr>
          <td
            className="td text-sm font-medium text-zinc-500"
            style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
          >
            Total {node.account.name}
          </td>
          <td className="td text-right font-mono font-medium">{formatMoney(node.total)}</td>
        </tr>
      )}
    </>
  );
}
