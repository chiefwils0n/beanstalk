import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getActiveBusiness } from "../../../lib/business";
import {
  profitAndLoss,
  balanceSheet,
  trialBalance,
  taxSummary,
  type AccountNode,
} from "../../../lib/accounting";
import { parseDate, toDateInput, todayUTC } from "../../../lib/money";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (typeof cell === "number" ? (cell / 100).toFixed(2) : csvEscape(cell))).join(",")
    )
    .join("\n");
}

function treeRows(nodes: AccountNode[], depth = 0): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const node of nodes) {
    if (node.total === 0 && node.children.length === 0) continue;
    out.push([`${"  ".repeat(depth)}${node.account.name}`, node.children.length ? node.own : node.total]);
    out.push(...treeRows(node.children, depth + 1));
    if (node.children.length) out.push([`${"  ".repeat(depth)}Total ${node.account.name}`, node.total]);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const business = await getActiveBusiness();
  if (!business) return NextResponse.json({ error: "No business" }, { status: 400 });

  const params = request.nextUrl.searchParams;
  const report = params.get("report");
  const today = todayUTC();
  const from = params.get("from") ? parseDate(params.get("from")!) : undefined;
  const to = params.get("to") ? parseDate(params.get("to")!) : today;
  const fromLabel = from ? toDateInput(from) : "all-time";
  const classId = params.get("class") || undefined;

  let rows: (string | number)[][] = [];
  let filename = "report.csv";

  switch (report) {
    case "profit-loss": {
      const data = await profitAndLoss(business.id, from, to, classId);
      filename = `profit-loss_${fromLabel}_${toDateInput(to)}.csv`;
      rows = [
        [`Profit & Loss — ${business.name}`, ""],
        [`${fromLabel} to ${toDateInput(to)}`, ""],
        ["Income", ""],
        ...treeRows(data.income),
        ["Total income", data.totalIncome],
        ["Expenses", ""],
        ...treeRows(data.expenses),
        ["Total expenses", data.totalExpenses],
        ["Net income", data.netIncome],
      ];
      break;
    }
    case "balance-sheet": {
      const asOf = params.get("asOf") ? parseDate(params.get("asOf")!) : today;
      const data = await balanceSheet(business.id, asOf);
      filename = `balance-sheet_${toDateInput(asOf)}.csv`;
      rows = [
        [`Balance Sheet — ${business.name}`, ""],
        [`As of ${toDateInput(asOf)}`, ""],
        ["Assets", ""],
        ...treeRows(data.assets),
        ["Total assets", data.totalAssets],
        ["Liabilities", ""],
        ...treeRows(data.liabilities),
        ["Total liabilities", data.totalLiabilities],
        ["Equity", ""],
        ...treeRows(data.equity),
        ["Net income to date", data.netIncome],
        ["Total equity", data.totalEquity],
      ];
      break;
    }
    case "trial-balance": {
      const tbFrom = params.get("from") ? parseDate(params.get("from")!) : undefined;
      const tbTo = params.get("to") ? parseDate(params.get("to")!) : undefined;
      const data = await trialBalance(business.id, tbFrom, tbTo);
      filename = "trial-balance.csv";
      rows = [
        ["Account", "Debit", "Credit"],
        ...data.rows.map((row): (string | number)[] => [
          `${row.account.code ? row.account.code + " " : ""}${row.account.name}`,
          row.debit,
          row.credit,
        ]),
        ["Totals", data.totalDebit, data.totalCredit],
      ];
      break;
    }
    case "general-ledger": {
      const accountId = params.get("account") || undefined;
      const contactId = params.get("contact") || undefined;
      const lines = await prisma.journalLine.findMany({
        where: {
          accountId,
          classId,
          contactId,
          entry: { businessId: business.id, status: "POSTED", date: { gte: from, lte: to } },
        },
        include: { entry: true, account: true, class: true, contact: true },
        orderBy: [{ entry: { date: "asc" } }],
      });
      filename = `general-ledger_${fromLabel}_${toDateInput(to)}.csv`;
      rows = [
        ["Date", "Account", "Memo", "Reference", "Name", "Class", "Debit", "Credit"],
        ...lines.map((line): (string | number)[] => [
          toDateInput(line.entry.date),
          line.account.name,
          line.description || line.entry.memo,
          line.entry.reference ?? "",
          line.contact?.name ?? "",
          line.class?.name ?? "",
          line.debit,
          line.credit,
        ]),
      ];
      break;
    }
    case "tax-summary": {
      const year = Number(params.get("year") ?? today.getUTCFullYear() - 1);
      const data = await taxSummary(business.id, year);
      filename = `tax-summary_${year}.csv`;
      rows = [
        [`Tax Summary ${year} — ${business.name}`, ""],
        ["Income", ""],
        ...data.incomeGroups.flatMap((group): (string | number)[][] => [
          [group.taxLine, group.total],
          ...group.accounts.map((a): (string | number)[] => [`  ${a.account.name}`, a.amount]),
        ]),
        ["Total income", data.totalIncome],
        ["Expenses", ""],
        ...data.expenseGroups.flatMap((group): (string | number)[][] => [
          [group.taxLine, group.total],
          ...group.accounts.map((a): (string | number)[] => [`  ${a.account.name}`, a.amount]),
        ]),
        ["Total expenses", data.totalExpenses],
        ["Net profit", data.netProfit],
      ];
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
