# 🌱 Beanstalk

Self-hosted double-entry accounting for small business — a QuickBooks replacement that keeps
your books in a local SQLite file and your documents in your own Google Drive.

## Features

- **Double-entry ledger** — every transaction is a balanced journal entry (debits = credits,
  enforced at the API). Void or edit entries with full line detail.
- **Chart of accounts with nesting** — assets, liabilities, equity, income, and expenses;
  sub-accounts roll up into their parents. A standard chart (with IRS Schedule C tax-line
  mappings) is seeded into every new business.
- **Multi-business** — create and manage any number of businesses and switch between them
  from the sidebar. Each keeps its own accounts, entries, invoices, tags, and documents.
- **Invoices** — draft → sent (posts Accounts Receivable) → paid (records the deposit),
  with partial payments, void, customer management, and auto-numbering.
- **Recurring transactions** — repeat any entry daily/weekly/monthly/yearly at an interval,
  with optional end date, auto-post or manual confirmation, catch-up posting, and pause/resume.
- **Tags** — color-coded labels across transactions (projects, clients, locations); filter
  the register by tag.
- **Reports for tax season** — Profit & Loss, Balance Sheet, Trial Balance, General Ledger,
  and a Tax Summary grouped by tax line for your accountant. All exportable as CSV.
- **Google Workspace document storage** — receipts, contracts, and statements upload to
  `Beanstalk/<business>` in your Google Drive and link to transactions and invoices.
- **Dark & light themes** — follows your system, toggleable from the sidebar.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Prisma 6 + SQLite · Tailwind CSS 4 ·
next-themes · googleapis

## Getting started

```bash
npm install
npx prisma migrate dev   # creates prisma/dev.db
npm run dev              # http://localhost:3000
```

Create your first business on the Businesses page — the chart of accounts is seeded
automatically. Optionally `npm run seed` to add a demo business with sample data
(delete it from the Businesses page when done).

All amounts are stored as integer cents; dates are stored as UTC dates.

## Google Drive setup (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   OAuth 2.0 client (Web application) and enable the **Google Drive API**.
2. Add `http://localhost:3000/api/google/callback` as an authorized redirect URI.
3. Copy the client ID/secret into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. Visit **Documents → Connect Google Drive**.

The integration uses the `drive.file` scope, so Beanstalk can only see files it created.

## Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build && npm start` | Production build / serve |
| `npm run db:migrate` | Apply schema changes |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run seed` | Create the demo business |

## Accounting conventions

- Debits increase assets and expenses; credits increase liabilities, equity, and income.
- Account balances are signed by the account's normal balance, so healthy accounts read
  positive everywhere in the UI.
- The Balance Sheet shows lifetime net income inside equity, so it always ties to assets.
- Voided entries stay in the register for audit but are excluded from every balance and report.
