/**
 * Import a QuickBooks Online chart-of-accounts export into a Beanstalk business.
 *
 * Usage:
 *   npx tsx scripts/import-qbo-coa.ts <csv-path> <business-name> [--replace-unused]
 *
 * Expects the CSV produced by QBO's Settings → Chart of accounts → Export to
 * Excel (columns: Account name, Account type, Detail type). Sub-accounts use
 * QBO's colon notation ("Parent:Child:Grandchild") and are recreated as nested
 * Beanstalk accounts.
 *
 * --replace-unused deletes existing accounts that have no journal lines,
 * invoice items, recurring lines, or loan references before importing (useful
 * for swapping out the seeded default chart). Accounts with activity are never
 * deleted.
 */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";

const QBO_TYPE_MAP: Record<string, string> = {
  "bank": "ASSET",
  "accounts receivable (a/r)": "ASSET",
  "other current assets": "ASSET",
  "fixed assets": "ASSET",
  "other assets": "ASSET",
  "accounts payable (a/p)": "LIABILITY",
  "credit card": "LIABILITY",
  "other current liabilities": "LIABILITY",
  "long term liabilities": "LIABILITY",
  "equity": "EQUITY",
  "income": "INCOME",
  "other income": "INCOME",
  "cost of goods sold": "EXPENSE",
  "expenses": "EXPENSE",
  "other expense": "EXPENSE",
};

// Default tax-line mappings for common QBO account names (full colon path).
// Schedule C for business operations, Schedule E for rental property accounts.
const TAX_LINES: Record<string, string> = {
  "Car & Truck": "Car & truck (Sch C Line 9)",
  "Contractors": "Contract labor (Sch C Line 11)",
  "Insurance": "Insurance (Sch C Line 15)",
  "Cost of Goods Sold": "Cost of goods sold (Sch C Line 4)",
  "Taxes & Licenses": "Taxes & licenses (Sch C Line 23)",
  "Rent & Lease": "Rent or lease (Sch C Line 20)",
  "Purchases": "Supplies (Sch C Line 22)",
  "Depreciation Expense": "Depreciation (Sch C Line 13)",
  "Operating Expenses:Advertising & Marketing": "Advertising (Sch C Line 8)",
  "Operating Expenses:Bank Fees & Finance Charges": "Other expenses (Sch C Line 27a)",
  "Operating Expenses:Computer & Internet Expense": "Office expense (Sch C Line 18)",
  "Operating Expenses:Credit Card Convenience Fee": "Other expenses (Sch C Line 27a)",
  "Operating Expenses:Meals & Entertainment": "Meals (Sch C Line 24b)",
  "Operating Expenses:Office Supplies & Software": "Office expense (Sch C Line 18)",
  "Operating Expenses:Other Business Expenses": "Other expenses (Sch C Line 27a)",
  "Operating Expenses:Professional Services": "Legal & professional (Sch C Line 17)",
  "Operating Expenses:Professional Services:Accounting Fees": "Legal & professional (Sch C Line 17)",
  "Operating Expenses:Professional Services:Consulting Fees": "Legal & professional (Sch C Line 17)",
  "Operating Expenses:Professional Services:Legal Fees - Business": "Legal & professional (Sch C Line 17)",
  "Operating Expenses:Repairs & Maintenance": "Repairs & maintenance (Sch C Line 21)",
  "Operating Expenses:Telephone/Wireless": "Other expenses (Sch C Line 27a)",
  "Operating Expenses:Travel & Parking": "Travel (Sch C Line 24a)",
  "Operating Expenses:Utilities": "Utilities (Sch C Line 25)",
  "Operating Expenses:Web Domain Hosting": "Other expenses (Sch C Line 27a)",
  "Rental Income - Residential": "Rents received (Sch E Line 3)",
  "Rental Property Expenses:Cleaning & Maintenance": "Cleaning & maintenance (Sch E Line 7)",
  "Rental Property Expenses:Insurance - Properties": "Insurance (Sch E Line 9)",
  "Rental Property Expenses:Professional & Legal Fees - Properties": "Legal & professional (Sch E Line 10)",
  "Rental Property Expenses:Inspections": "Legal & professional (Sch E Line 10)",
  "Rental Property Expenses:Management Fees": "Management fees (Sch E Line 11)",
  "Rental Property Expenses:Mortgage Interest": "Mortgage interest (Sch E Line 12)",
  "Rental Property Expenses:Repairs": "Repairs (Sch E Line 14)",
  "Rental Property Expenses:Operating Supplies & Materials": "Supplies (Sch E Line 15)",
  "Rental Property Expenses:Property Taxes": "Taxes (Sch E Line 16)",
  "Rental Property Expenses:Utilities": "Utilities (Sch E Line 17)",
  "Rental Property Expenses:Home Owner's Association": "Other (Sch E Line 19)",
  "Rental Property Expenses:Landscaping & Groundskeeping": "Other (Sch E Line 19)",
  "Rental Property Expenses:Appliances & Furniture (under 2500)": "Other (Sch E Line 19)",
  "Sales": "Gross receipts (Sch C Line 1)",
  "Sales of Product Income": "Gross receipts (Sch C Line 1)",
  "Billable Expense Income": "Gross receipts (Sch C Line 1)",
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

async function main() {
  const [csvPath, businessName, ...flags] = process.argv.slice(2);
  if (!csvPath || !businessName) {
    console.error("Usage: npx tsx scripts/import-qbo-coa.ts <csv-path> <business-name> [--replace-unused]");
    process.exit(1);
  }
  const replaceUnused = flags.includes("--replace-unused");

  const business = await prisma.business.findFirst({ where: { name: businessName } });
  if (!business) throw new Error(`Business not found: ${businessName}`);

  const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const nameCol = header.findIndex((h) => h.includes("account name") || h === "name");
  const typeCol = header.findIndex((h) => h.includes("account type") || h === "type");
  const detailCol = header.findIndex((h) => h.includes("detail"));
  if (nameCol < 0 || typeCol < 0) throw new Error("CSV needs 'Account name' and 'Account type' columns");

  type Row = { path: string; type: string; detail: string };
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const path = fields[nameCol];
    const qboType = (fields[typeCol] ?? "").toLowerCase();
    if (!path) continue;
    const type = QBO_TYPE_MAP[qboType];
    if (!type) {
      console.warn(`skip (unknown QBO type "${fields[typeCol]}"): ${path}`);
      continue;
    }
    rows.push({ path, type, detail: detailCol >= 0 ? fields[detailCol] : "" });
  }
  console.log(`Parsed ${rows.length} accounts from ${csvPath}`);

  if (replaceUnused) {
    // Delete deepest-first so parents go after their children.
    const existing = await prisma.account.findMany({
      where: { businessId: business.id },
      include: {
        _count: {
          select: {
            lines: true, invoiceItems: true, recurringLines: true,
            loansAsLiability: true, loansAsInterest: true, loansAsPayment: true,
          },
        },
      },
    });
    const used = new Set(
      existing
        .filter((a) =>
          a._count.lines || a._count.invoiceItems || a._count.recurringLines ||
          a._count.loansAsLiability || a._count.loansAsInterest || a._count.loansAsPayment
        )
        .map((a) => a.id)
    );
    // Parents of used accounts must survive too.
    const byId = new Map(existing.map((a) => [a.id, a]));
    for (const id of [...used]) {
      let cur = byId.get(id);
      while (cur?.parentId) {
        used.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
    }
    const deletable = existing.filter((a) => !used.has(a.id));
    let remaining = deletable.map((a) => a.id);
    let deleted = 0;
    while (remaining.length) {
      const childCounts = await prisma.account.groupBy({
        by: ["parentId"],
        where: { parentId: { in: remaining } },
        _count: true,
      });
      const hasChildren = new Set(childCounts.map((c) => c.parentId));
      const leaves = remaining.filter((id) => !hasChildren.has(id));
      if (!leaves.length) break;
      await prisma.account.deleteMany({ where: { id: { in: leaves } } });
      deleted += leaves.length;
      remaining = remaining.filter((id) => !leaves.includes(id));
    }
    console.log(`Removed ${deleted} unused existing accounts (${used.size} kept — they have activity)`);
  }

  // Create accounts shallow-first so parents exist before children.
  rows.sort((a, b) => a.path.split(":").length - b.path.split(":").length);
  const idByPath = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const segments = row.path.split(":").map((s) => s.trim());
    const name = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join(":");
    let parentId = parentPath ? idByPath.get(parentPath) ?? null : null;
    if (parentPath && !parentId) {
      console.warn(`parent not found for ${row.path} — importing at top level`);
      parentId = null;
    }
    const existing = await prisma.account.findFirst({
      where: { businessId: business.id, name, type: row.type, parentId },
    });
    if (existing) {
      idByPath.set(row.path, existing.id);
      skipped++;
      continue;
    }
    const account = await prisma.account.create({
      data: {
        businessId: business.id,
        name,
        type: row.type,
        parentId,
        taxLine: TAX_LINES[row.path] ?? null,
        description: row.detail && row.detail !== name ? `QBO detail type: ${row.detail}` : null,
      },
    });
    idByPath.set(row.path, account.id);
    created++;
  }
  console.log(`Created ${created} accounts (${skipped} already existed) for ${business.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
