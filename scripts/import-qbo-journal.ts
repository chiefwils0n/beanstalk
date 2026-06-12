/**
 * Replay a QuickBooks Online Journal report export as Beanstalk journal entries.
 *
 * Usage:
 *   npx tsx scripts/import-qbo-journal.ts <journal-csv> <business-name> [--dry-run]
 *
 * Expects the CSV produced by QBO's Reports → Journal → Export (columns:
 * Transaction date, Transaction type, Num, Name, Description, Full name
 * [account path], Debit, Credit; transactions arrive as numbered groups
 * ending in a "Total for N" row).
 *
 * - Accounts are matched by full colon path against the business's chart;
 *   unknown accounts are created (type EXPENSE, flagged in the description).
 * - The Name column is matched to contacts by name (or last path segment);
 *   unknown names become untyped contacts so per-name reporting works.
 * - Every entry is validated debits === credits before posting; the whole
 *   import aborts (nothing written) if any group is unbalanced.
 * - All imported entries are tagged "QBO Import" for easy filtering/undo.
 */
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";

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

function cents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Bad amount: ${value}`);
  return Math.round(n * 100);
}

function parseUsDate(value: string): Date {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error(`Bad date: ${value}`);
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

type Line = {
  date: Date;
  type: string;
  num: string;
  name: string;
  description: string;
  accountPath: string;
  debit: number;
  credit: number;
};

async function main() {
  const [csvPath, businessName, ...flags] = process.argv.slice(2);
  if (!csvPath || !businessName) {
    console.error("Usage: npx tsx scripts/import-qbo-journal.ts <journal-csv> <business-name> [--dry-run]");
    process.exit(1);
  }
  const dryRun = flags.includes("--dry-run");

  const business = await prisma.business.findFirst({ where: { name: businessName } });
  if (!business) throw new Error(`Business not found: ${businessName}`);

  // ---- parse the CSV into transaction groups
  const rawLines = readFileSync(csvPath, "utf8").split(/\r?\n/);
  const headerIdx = rawLines.findIndex((l) => l.includes("Transaction date"));
  if (headerIdx < 0) throw new Error("Header row with 'Transaction date' not found");
  const header = parseCsvLine(rawLines[headerIdx]);
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cDate = col("Transaction date");
  const cType = col("Transaction type");
  const cNum = col("Num");
  const cName = col("Name");
  const cDesc = col("Description");
  const cAccount = col("Full name");
  const cDebit = col("Debit");
  const cCredit = col("Credit");

  const groups: { qboId: string; lines: Line[] }[] = [];
  let current: { qboId: string; lines: Line[] } | null = null;
  for (const raw of rawLines.slice(headerIdx + 1)) {
    if (!raw.trim()) continue;
    const fields = parseCsvLine(raw);
    if (fields[0].startsWith("Total for")) {
      if (current && current.lines.length) groups.push(current);
      current = null;
      continue;
    }
    if (fields[0] && !fields[cDate]) {
      // group marker row: "<qbo txn id>,,,,..."
      if (current && current.lines.length) groups.push(current);
      current = { qboId: fields[0], lines: [] };
      continue;
    }
    if (!fields[cDate] || !fields[cAccount]) continue;
    if (!current) current = { qboId: "", lines: [] };
    current.lines.push({
      date: parseUsDate(fields[cDate]),
      type: fields[cType] ?? "",
      num: fields[cNum] ?? "",
      name: fields[cName] ?? "",
      description: fields[cDesc] ?? "",
      accountPath: fields[cAccount],
      debit: cents(fields[cDebit] ?? ""),
      credit: cents(fields[cCredit] ?? ""),
    });
  }
  if (current && current.lines.length) groups.push(current);

  // ---- validate every group balances before touching the database
  const total = (g: { lines: Line[] }) => ({
    d: g.lines.reduce((s, l) => s + l.debit, 0),
    c: g.lines.reduce((s, l) => s + l.credit, 0),
  });
  // Zero-amount transactions ($0 voids/placeholders) carry no financial data — skip them.
  const zeroGroups = groups.filter((g) => {
    const { d, c } = total(g);
    return d === 0 && c === 0;
  });
  const groupsToImport = groups.filter((g) => !zeroGroups.includes(g));
  const unbalanced = groupsToImport.filter((g) => {
    const { d, c } = total(g);
    return d !== c;
  });
  if (unbalanced.length) {
    for (const g of unbalanced.slice(0, 10)) {
      const d = g.lines.reduce((s, l) => s + l.debit, 0);
      const c = g.lines.reduce((s, l) => s + l.credit, 0);
      console.error(`UNBALANCED qbo#${g.qboId} (${g.lines[0]?.date.toISOString().slice(0, 10)}): debit ${d} credit ${c}`);
    }
    throw new Error(`${unbalanced.length} unbalanced transaction group(s) — aborting, nothing imported`);
  }

  // ---- resolve accounts by full colon path
  const accounts = await prisma.account.findMany({ where: { businessId: business.id } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const pathOf = (a: (typeof accounts)[number]): string => {
    const parent = a.parentId ? byId.get(a.parentId) : undefined;
    return parent ? `${pathOf(parent)}:${a.name}` : a.name;
  };
  const accountByPath = new Map(accounts.map((a) => [pathOf(a), a.id]));

  const missingAccounts = [...new Set(groupsToImport.flatMap((g) => g.lines.map((l) => l.accountPath)))].filter(
    (p) => !accountByPath.has(p)
  );

  // ---- resolve contacts by name (or last segment of QBO sub-customer paths)
  const contacts = await prisma.contact.findMany({ where: { businessId: business.id } });
  const contactByName = new Map(contacts.map((c) => [c.name.toLowerCase(), c.id]));
  const resolveContact = (name: string): string | null | "missing" => {
    if (!name) return null;
    const segments = name.split(":").map((s) => s.trim());
    return (
      contactByName.get(name.toLowerCase()) ??
      contactByName.get(segments[segments.length - 1].toLowerCase()) ??
      "missing"
    );
  };
  const missingContacts = [
    ...new Set(
      groups
        .flatMap((g) => g.lines.map((l) => l.name))
        .filter((n) => n && resolveContact(n) === "missing")
    ),
  ];

  const totalDebit = groupsToImport.reduce((s, g) => s + g.lines.reduce((x, l) => x + l.debit, 0), 0);
  console.log(
    JSON.stringify(
      {
        transactions: groupsToImport.length, skippedZeroAmount: zeroGroups.map((g) => g.qboId),
        lines: groupsToImport.reduce((s, g) => s + g.lines.length, 0),
        dateRange: [
          groupsToImport.map((g) => g.lines[0].date).sort((a, b) => +a - +b)[0]?.toISOString().slice(0, 10),
          groupsToImport.map((g) => g.lines[0].date).sort((a, b) => +b - +a)[0]?.toISOString().slice(0, 10),
        ],
        totalDebit,
        accountsToCreate: missingAccounts,
        contactsToCreate: missingContacts.length,
      },
      null,
      1
    )
  );
  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  // ---- create missing accounts (flagged) and contacts (untyped)
  for (const path of missingAccounts) {
    const segments = path.split(":").map((s) => s.trim());
    let parentId: string | null = null;
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      prefix = prefix ? `${prefix}:${segments[i]}` : segments[i];
      let id = accountByPath.get(prefix);
      if (!id) {
        const created = await prisma.account.create({
          data: {
            businessId: business.id,
            name: segments[i],
            type: "EXPENSE",
            parentId,
            description: "Created by QBO journal import — verify the account type",
          },
        });
        id = created.id;
        accountByPath.set(prefix, id);
      }
      parentId = id;
    }
  }
  for (const name of missingContacts) {
    const segments = name.split(":").map((s) => s.trim());
    const display = segments[segments.length - 1];
    if (contactByName.has(display.toLowerCase())) continue;
    const created = await prisma.contact.create({
      data: { businessId: business.id, name: display, notes: "Created by QBO journal import" },
    });
    contactByName.set(display.toLowerCase(), created.id);
  }

  const tag = await prisma.tag.upsert({
    where: { businessId_name: { businessId: business.id, name: "QBO Import" } },
    create: { businessId: business.id, name: "QBO Import", color: "#6366f1" },
    update: {},
  });

  // ---- post entries
  let created = 0;
  for (const group of groupsToImport) {
    const first = group.lines[0];
    const memo =
      group.lines.map((l) => l.description).find(Boolean) ||
      `${first.type}${first.num ? ` ${first.num}` : ""}` ||
      "Imported transaction";
    await prisma.journalEntry.create({
      data: {
        businessId: business.id,
        date: first.date,
        memo: memo.slice(0, 200),
        reference: [first.type, first.num, group.qboId ? `QBO#${group.qboId}` : ""]
          .filter(Boolean)
          .join(" ")
          .slice(0, 100),
        tags: { create: [{ tagId: tag.id }] },
        lines: {
          create: group.lines.map((line) => {
            const accountId = accountByPath.get(line.accountPath);
            if (!accountId) throw new Error(`Account not resolved: ${line.accountPath}`);
            const contact = line.name ? resolveContact(line.name) : null;
            return {
              accountId,
              contactId: contact && contact !== "missing" ? contact : null,
              description: line.description || null,
              debit: line.debit,
              credit: line.credit,
            };
          }),
        },
      },
    });
    created++;
    if (created % 200 === 0) console.log(`…${created}/${groupsToImport.length}`);
  }
  console.log(`Imported ${created} journal entries for ${business.name} (tagged "QBO Import")`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
