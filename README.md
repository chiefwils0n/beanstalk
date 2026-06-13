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
npm install
npx prisma migrate deploy   # creates prisma/beanstalk.db (your real books)
npm run sandbox:refresh     # clone it to prisma/sandbox.db for development
npm run start:prod          # build + serve at http://localhost:3000
```

Create your first business on the Businesses page — the chart of accounts is seeded
automatically.

All amounts are stored as integer cents; dates are stored as UTC dates.

## Running Beanstalk: production vs. development

Beanstalk runs in two independent modes that **never share data**, so day-to-day
bookkeeping is never disturbed by building new features:

| | Production (your real books) | Development (building features) |
| --- | --- | --- |
| Start with | `npm run start:prod` | `npm run dev` |
| URL | http://localhost:3000 | http://localhost:3001 |
| Database | `prisma/beanstalk.db` | `prisma/sandbox.db` |
| Reflects code changes | only after a rebuild | instantly (hot reload) |

- **Production** serves a compiled build and is your daily driver. It's stable — it won't
  stop when you edit code. To roll new features in, run `npm run start:prod` again (it
  rebuilds, then serves).
- **Development** hot-reloads on every edit but runs against a throwaway `sandbox.db`, so
  experiments, test transactions, and trial migrations can't touch your real books.
- For an always-on production server that survives reboots/crashes, use a process manager:
  `pm2 start "npm start" --name beanstalk`.

### Promoting a change from development to production

1. Build & verify the feature in dev (`npm run dev`); schema changes go through
   `npm run db:migrate` (which targets the sandbox).
2. Apply any new migrations to your real books: `npm run db:deploy`
   (back up `prisma/beanstalk.db` first — copy the file somewhere safe).
3. Rebuild and restart production: `npm run start:prod`.
4. Re-clone the sandbox so dev mirrors live data again: `npm run sandbox:refresh`.

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
| `npm run start:prod` | Build + serve production on :3000 (real books) |
| `npm run dev` | Dev server on :3001 (sandbox db, hot reload) |
| `npm run db:migrate` | Create/apply a schema migration on the sandbox |
| `npm run db:deploy` | Apply committed migrations to the real books |
| `npm run sandbox:refresh` | Re-clone sandbox.db from your real books |
| `npm run db:studio` | Browse the real database in Prisma Studio |
| `npm run db:studio:sandbox` | Browse the sandbox database |
| `npm run seed` | Add the sample demo business (sandbox only) |

## Accounting conventions

- Debits increase assets and expenses; credits increase liabilities, equity, and income.
- Account balances are signed by the account's normal balance, so healthy accounts read
  positive everywhere in the UI.
- The Balance Sheet shows lifetime net income inside equity, so it always ties to assets.
- Voided entries stay in the register for audit but are excluded from every balance and report.
