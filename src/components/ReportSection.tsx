// Colored section-header row for report tables (Balance Sheet, P&L).
// Tones match the Chart of Accounts / dashboard palette; title stays neutral
// (black / white) for readability — only the bar and tint carry color.
const TONES = {
  asset: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/40",
  liability: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40",
  equity: "border-l-slate-500 bg-slate-100 dark:bg-slate-800/40",
  income: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
  expense: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/40",
} as const;

export function ReportSectionHeader({
  label,
  tone,
  gap = false,
  colSpan = 2,
}: {
  label: string;
  tone: keyof typeof TONES;
  gap?: boolean;
  colSpan?: number;
}) {
  return (
    <>
      {gap && (
        <tr aria-hidden>
          <td colSpan={colSpan} className="h-3" />
        </tr>
      )}
      <tr>
        <td
          colSpan={colSpan}
          className={`border-l-4 px-3 py-2 text-base font-bold text-zinc-900 dark:text-zinc-100 ${TONES[tone]}`}
        >
          {label}
        </td>
      </tr>
    </>
  );
}
