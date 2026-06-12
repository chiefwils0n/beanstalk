import { formatMoney, formatDate } from "../lib/money";
import type { ScheduleRow } from "../lib/loans";

const W = 680;
const H = 200;
const PAD = { top: 10, right: 12, bottom: 22, left: 12 };

function path(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

/**
 * Payoff curve: remaining balance per payment. The original schedule renders
 * as a dashed baseline; the actual history + current projection in green, so
 * extra principal visibly bends the curve left.
 */
export function PayoffChart({
  principal,
  baseline,
  historyBalances,
  projected,
}: {
  principal: number;
  baseline: ScheduleRow[];
  historyBalances: number[]; // balance after each recorded payment
  projected: ScheduleRow[];
}) {
  const months = Math.max(baseline.length, historyBalances.length + projected.length, 1);
  const maxY = principal;
  const x = (n: number) => PAD.left + (n / months) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom);

  const basePts: [number, number][] = [[x(0), y(principal)], ...baseline.map((row, i): [number, number] => [x(i + 1), y(row.balance)])];
  const actual: number[] = [principal, ...historyBalances, ...projected.map((row) => row.balance)];
  const actualPts: [number, number][] = actual.map((v, i): [number, number] => [x(i), y(v)]);
  const historyEndX = x(historyBalances.length);
  const payoff = projected.length ? projected[projected.length - 1].date : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Loan payoff curve">
      <line x1={PAD.left} y1={y(0)} x2={W - PAD.right} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
      <path d={path(basePts)} className="fill-none stroke-zinc-400 dark:stroke-zinc-600" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={path(actualPts)} className="fill-none stroke-emerald-500" strokeWidth="2.5" />
      {historyBalances.length > 0 && (
        <line x1={historyEndX} y1={PAD.top} x2={historyEndX} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" strokeDasharray="2 3" />
      )}
      <text x={PAD.left} y={PAD.top + 4} className="fill-zinc-500 text-[11px]">{formatMoney(principal)}</text>
      <text x={PAD.left} y={H - 6} className="fill-zinc-500 text-[11px]">today’s schedule (solid) vs original (dashed)</text>
      {payoff && (
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-emerald-600 text-[11px] dark:fill-emerald-400">
          paid off {formatDate(payoff)}
        </text>
      )}
    </svg>
  );
}

/**
 * Principal vs interest split for each remaining payment — interest (amber)
 * shrinks while principal (green) grows as the balance falls.
 */
export function SplitChart({ projected }: { projected: ScheduleRow[] }) {
  if (projected.length === 0) return null;
  const maxY = Math.max(...projected.map((row) => row.payment));
  const x = (i: number) => PAD.left + (i / Math.max(projected.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom);

  const interestArea =
    path([[x(0), y(0)], ...projected.map((row, i): [number, number] => [x(i), y(row.interest)])]) +
    `L${x(projected.length - 1).toFixed(1)},${y(0).toFixed(1)}Z`;
  const totalArea =
    path([
      [x(0), y(projected[0].interest)],
      ...projected.map((row, i): [number, number] => [x(i), y(row.interest + row.principal)]),
    ]) +
    `L${x(projected.length - 1).toFixed(1)},${y(projected[projected.length - 1].interest).toFixed(1)}` +
    path(
      [...projected.map((row, i): [number, number] => [x(i), y(row.interest)])].reverse()
    ).replace(/^M/, "L") +
    "Z";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Principal vs interest per payment">
      <path d={interestArea} className="fill-amber-400/40 dark:fill-amber-500/30" />
      <path d={totalArea} className="fill-emerald-500/40 dark:fill-emerald-500/30" />
      <line x1={PAD.left} y1={y(0)} x2={W - PAD.right} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
      <text x={PAD.left} y={PAD.top + 4} className="fill-zinc-500 text-[11px]">{formatMoney(maxY)} / payment</text>
      <text x={PAD.left} y={H - 6} className="fill-amber-600 text-[11px] dark:fill-amber-400">■ interest</text>
      <text x={PAD.left + 70} y={H - 6} className="fill-emerald-600 text-[11px] dark:fill-emerald-400">■ principal</text>
    </svg>
  );
}
