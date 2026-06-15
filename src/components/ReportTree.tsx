import Link from "next/link";
import { formatMoney } from "../lib/money";
import type { AccountNode } from "../lib/accounting";

export type DrillRange = { from?: string; to?: string; classId?: string };

/** Link into the General Ledger filtered to one account over the report's range.
 *  Pass `includeSub` to include the account's sub-accounts (descendants). */
export function ledgerHref(accountId: string, drill?: DrillRange, includeSub = false): string {
  const params = new URLSearchParams({ account: accountId });
  if (drill?.from) params.set("from", drill.from);
  if (drill?.to) params.set("to", drill.to);
  if (drill?.classId) params.set("class", drill.classId);
  if (includeSub) params.set("subaccounts", "1");
  return `/reports/general-ledger?${params.toString()}`;
}

const DRILL_LINK = "hover:text-emerald-600 hover:underline dark:hover:text-emerald-400";

export function ReportTreeRows({
  nodes,
  depth = 0,
  hideZero = true,
  drill,
  drillOn = "name",
}: {
  nodes: AccountNode[];
  depth?: number;
  hideZero?: boolean;
  drill?: DrillRange;
  /** Which cell is the drill-down link: the account "name" (default) or the
   *  dollar "amount". */
  drillOn?: "name" | "amount";
}) {
  return (
    <>
      {nodes.map((node) => {
        if (hideZero && node.total === 0 && node.children.length === 0) return null;
        return (
          <ReportTreeRow
            key={node.account.id}
            node={node}
            depth={depth}
            hideZero={hideZero}
            drill={drill}
            drillOn={drillOn}
          />
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
  drillOn,
}: {
  node: AccountNode;
  depth: number;
  hideZero: boolean;
  drill?: DrillRange;
  drillOn: "name" | "amount";
}) {
  const hasChildren = node.children.length > 0;
  const drillAmount = drillOn === "amount";
  const ownAmount = formatMoney(hasChildren ? node.own : node.total);
  return (
    <>
      <tr>
        <td className="td" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          {node.account.code && (
            <span className="mr-2 font-mono text-xs text-zinc-400">{node.account.code}</span>
          )}
          {drillAmount ? (
            <span className={hasChildren ? "font-medium" : ""}>{node.account.name}</span>
          ) : (
            <Link href={ledgerHref(node.account.id, drill)} className={`${DRILL_LINK} ${hasChildren ? "font-medium" : ""}`}>
              {node.account.name}
            </Link>
          )}
        </td>
        <td className="td text-right money">
          {drillAmount ? (
            <Link href={ledgerHref(node.account.id, drill)} className={DRILL_LINK} title="View transactions">
              {ownAmount}
            </Link>
          ) : (
            ownAmount
          )}
        </td>
      </tr>
      <ReportTreeRows nodes={node.children} depth={depth + 1} hideZero={hideZero} drill={drill} drillOn={drillOn} />
      {hasChildren && (
        <tr className="total-row">
          <td
            className="td text-sm font-medium text-zinc-500"
            style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
          >
            {drillAmount ? (
              <span>Total {node.account.name}</span>
            ) : (
              <Link href={ledgerHref(node.account.id, drill, true)} className={DRILL_LINK} title="Includes sub-accounts">
                Total {node.account.name}
              </Link>
            )}
          </td>
          <td className="td text-right money font-medium">
            {drillAmount ? (
              <Link
                href={ledgerHref(node.account.id, drill, true)}
                className={DRILL_LINK}
                title="View transactions (includes sub-accounts)"
              >
                {formatMoney(node.total)}
              </Link>
            ) : (
              formatMoney(node.total)
            )}
          </td>
        </tr>
      )}
    </>
  );
}
