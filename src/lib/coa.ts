import { prisma } from "./db";

type CoaNode = {
  code: string;
  name: string;
  type: string;
  taxLine?: string;
  children?: CoaNode[];
};

/**
 * Default chart of accounts seeded into every new business.
 * Expense tax lines map to IRS Schedule C; adjust per entity type as needed.
 */
export const DEFAULT_COA: CoaNode[] = [
  {
    code: "1000",
    name: "Cash & Bank",
    type: "ASSET",
    children: [
      { code: "1010", name: "Checking", type: "ASSET" },
      { code: "1020", name: "Savings", type: "ASSET" },
    ],
  },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  {
    code: "1500",
    name: "Fixed Assets",
    type: "ASSET",
    children: [
      { code: "1510", name: "Equipment", type: "ASSET" },
      { code: "1590", name: "Accumulated Depreciation", type: "ASSET" },
    ],
  },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Credit Card", type: "LIABILITY" },
  { code: "2200", name: "Loans Payable", type: "LIABILITY" },
  { code: "2300", name: "Sales Tax Payable", type: "LIABILITY" },
  {
    code: "3000",
    name: "Owner's Equity",
    type: "EQUITY",
    children: [
      { code: "3010", name: "Owner Contributions", type: "EQUITY" },
      { code: "3020", name: "Owner Draws", type: "EQUITY" },
    ],
  },
  { code: "3900", name: "Retained Earnings", type: "EQUITY" },
  { code: "4000", name: "Sales", type: "INCOME", taxLine: "Gross receipts (Line 1)" },
  { code: "4100", name: "Service Income", type: "INCOME", taxLine: "Gross receipts (Line 1)" },
  { code: "4900", name: "Other Income", type: "INCOME", taxLine: "Other income (Line 6)" },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", taxLine: "Cost of goods sold (Line 4)" },
  {
    code: "6000",
    name: "Operating Expenses",
    type: "EXPENSE",
    children: [
      { code: "6010", name: "Advertising & Marketing", type: "EXPENSE", taxLine: "Advertising (Line 8)" },
      { code: "6020", name: "Bank & Merchant Fees", type: "EXPENSE", taxLine: "Other expenses (Line 27a)" },
      { code: "6030", name: "Contract Labor", type: "EXPENSE", taxLine: "Contract labor (Line 11)" },
      { code: "6040", name: "Insurance", type: "EXPENSE", taxLine: "Insurance (Line 15)" },
      { code: "6050", name: "Legal & Professional", type: "EXPENSE", taxLine: "Legal & professional (Line 17)" },
      { code: "6060", name: "Meals (50%)", type: "EXPENSE", taxLine: "Meals (Line 24b)" },
      { code: "6070", name: "Office Supplies", type: "EXPENSE", taxLine: "Supplies (Line 22)" },
      { code: "6080", name: "Rent & Lease", type: "EXPENSE", taxLine: "Rent or lease (Line 20)" },
      { code: "6090", name: "Repairs & Maintenance", type: "EXPENSE", taxLine: "Repairs & maintenance (Line 21)" },
      { code: "6100", name: "Software & Subscriptions", type: "EXPENSE", taxLine: "Other expenses (Line 27a)" },
      { code: "6110", name: "Travel", type: "EXPENSE", taxLine: "Travel (Line 24a)" },
      { code: "6120", name: "Utilities", type: "EXPENSE", taxLine: "Utilities (Line 25)" },
      { code: "6130", name: "Vehicle Expenses", type: "EXPENSE", taxLine: "Car & truck (Line 9)" },
      { code: "6140", name: "Wages", type: "EXPENSE", taxLine: "Wages (Line 26)" },
    ],
  },
  { code: "6900", name: "Taxes & Licenses", type: "EXPENSE", taxLine: "Taxes & licenses (Line 23)" },
];

export async function seedChartOfAccounts(businessId: string) {
  async function createNodes(nodes: CoaNode[], parentId: string | null) {
    for (const node of nodes) {
      const account = await prisma.account.create({
        data: {
          businessId,
          code: node.code,
          name: node.name,
          type: node.type,
          taxLine: node.taxLine ?? null,
          parentId,
        },
      });
      if (node.children) await createNodes(node.children, account.id);
    }
  }
  await createNodes(DEFAULT_COA, null);
}
