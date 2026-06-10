import { formatMoney } from "../lib/money";
import type { AccountNode } from "../lib/accounting";

export function ReportTreeRows({
  nodes,
  depth = 0,
  hideZero = true,
}: {
  nodes: AccountNode[];
  depth?: number;
  hideZero?: boolean;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (hideZero && node.total === 0 && node.children.length === 0) return null;
        return (
          <ReportTreeRow key={node.account.id} node={node} depth={depth} hideZero={hideZero} />
        );
      })}
    </>
  );
}

function ReportTreeRow({
  node,
  depth,
  hideZero,
}: {
  node: AccountNode;
  depth: number;
  hideZero: boolean;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <>
      <tr>
        <td className="td" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          {node.account.code && (
            <span className="mr-2 font-mono text-xs text-zinc-400">{node.account.code}</span>
          )}
          <span className={hasChildren ? "font-medium" : ""}>{node.account.name}</span>
        </td>
        <td className="td text-right font-mono">{formatMoney(hasChildren ? node.own : node.total)}</td>
      </tr>
      <ReportTreeRows nodes={node.children} depth={depth + 1} hideZero={hideZero} />
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
