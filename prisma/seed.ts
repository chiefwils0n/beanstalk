/**
 * Optional demo data: creates "Sample Co (demo)" with a seeded chart of accounts
 * and a few months of activity so reports have something to show.
 * Run with: npm run seed   — delete the business from the UI when done.
 */
import { prisma } from "../src/lib/db";
import { seedChartOfAccounts } from "../src/lib/coa";
import { parseDate } from "../src/lib/money";

async function account(businessId: string, name: string) {
  const found = await prisma.account.findFirst({ where: { businessId, name } });
  if (!found) throw new Error(`Account not found: ${name}`);
  return found;
}

async function main() {
  const existing = await prisma.business.findFirst({ where: { name: "Sample Co (demo)" } });
  if (existing) {
    console.log("Demo business already exists — skipping.");
    return;
  }
  const business = await prisma.business.create({
    data: { name: "Sample Co (demo)", legalName: "Sample Co LLC", taxId: "12-3456789" },
  });
  await seedChartOfAccounts(business.id);

  const checking = await account(business.id, "Checking");
  const sales = await account(business.id, "Service Income");
  const rent = await account(business.id, "Rent & Lease");
  const software = await account(business.id, "Software & Subscriptions");
  const ownerEquity = await account(business.id, "Owner Contributions");

  const tag = await prisma.tag.create({
    data: { businessId: business.id, name: "Client A", color: "#6366f1" },
  });

  const entries: { date: string; memo: string; lines: { accountId: string; debit: number; credit: number }[]; tag?: boolean }[] = [
    {
      date: "2026-01-05",
      memo: "Owner initial contribution",
      lines: [
        { accountId: checking.id, debit: 1500000, credit: 0 },
        { accountId: ownerEquity.id, debit: 0, credit: 1500000 },
      ],
    },
    {
      date: "2026-02-12",
      memo: "Consulting revenue — February",
      tag: true,
      lines: [
        { accountId: checking.id, debit: 850000, credit: 0 },
        { accountId: sales.id, debit: 0, credit: 850000 },
      ],
    },
    {
      date: "2026-03-12",
      memo: "Consulting revenue — March",
      tag: true,
      lines: [
        { accountId: checking.id, debit: 920000, credit: 0 },
        { accountId: sales.id, debit: 0, credit: 920000 },
      ],
    },
    {
      date: "2026-03-01",
      memo: "Office rent — March",
      lines: [
        { accountId: rent.id, debit: 220000, credit: 0 },
        { accountId: checking.id, debit: 0, credit: 220000 },
      ],
    },
    {
      date: "2026-04-15",
      memo: "Annual software licenses",
      lines: [
        { accountId: software.id, debit: 65000, credit: 0 },
        { accountId: checking.id, debit: 0, credit: 65000 },
      ],
    },
  ];

  for (const e of entries) {
    await prisma.journalEntry.create({
      data: {
        businessId: business.id,
        date: parseDate(e.date),
        memo: e.memo,
        lines: { create: e.lines },
        tags: e.tag ? { create: [{ tagId: tag.id }] } : undefined,
      },
    });
  }

  await prisma.recurringTransaction.create({
    data: {
      businessId: business.id,
      name: "Office rent",
      memo: "Monthly office rent",
      frequency: "MONTHLY",
      interval: 1,
      nextRun: parseDate("2026-07-01"),
      autoPost: true,
      lines: {
        create: [
          { accountId: rent.id, debit: 220000, credit: 0 },
          { accountId: checking.id, debit: 0, credit: 220000 },
        ],
      },
    },
  });

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Globex Corp", email: "ap@globex.example" },
  });
  await prisma.invoice.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      number: "INV-0001",
      issueDate: parseDate("2026-05-20"),
      dueDate: parseDate("2026-06-19"),
      total: 480000,
      items: {
        create: [
          {
            accountId: sales.id,
            description: "May consulting retainer",
            quantity: 1,
            unitPrice: 480000,
            amount: 480000,
          },
        ],
      },
    },
  });

  console.log("Seeded demo business: Sample Co (demo)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
