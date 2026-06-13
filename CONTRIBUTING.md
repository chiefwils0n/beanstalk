# Contributing to Beanstalk

Thanks for helping improve Beanstalk. It's a self-hosted double-entry accounting
app, so correctness matters more than features — a bug here is someone's wrong tax
return. This guide covers how to set up, the rules that keep the books trustworthy,
and how to get a PR merged.

## Your data is never at risk

Beanstalk is local-first. Each person's books live in a SQLite file that is
**gitignored** — only code, the Prisma schema, and migration files are tracked.
Cloning the repo gives you no one else's data, and no pull request can carry or
corrupt anyone's books. Develop freely.

## Setup

Requires Node 20+ (CI runs Node 22).

```bash
git clone <your-fork>
cd beanstalk
npm install
npm run db:migrate     # creates + migrates a fresh prisma/sandbox.db
npm run seed           # optional: a sample demo business (sandbox only)
npm run dev            # http://localhost:3001  (hot reload)
```

`npm run dev` runs on **port 3001** against a throwaway `sandbox.db`. A real,
data-bearing install runs separately (`npm run start:prod`, port 3000, against
`beanstalk.db`) — see the README's "production vs development" section. As a
contributor you only ever need the sandbox.

## Architecture

A quick map so your change lands in the right place.

**Stack:** Next.js (App Router) + React Server Components, Prisma + SQLite,
Tailwind. TypeScript throughout.

**This is not the Next.js you may know.** The repo pins a recent Next major with
breaking changes — read the relevant guide in `node_modules/next/dist/docs/`
before writing framework code (see [`AGENTS.md`](AGENTS.md)). Specifically:

- `params`, `searchParams`, and `cookies()` are **async** — always `await` them.
- Request gating lives in **`src/proxy.ts`** (the old `middleware.ts`), which runs
  in the Node.js runtime.
- Mutations are **Server Actions** (`"use server"`), not API routes.

**Where things live:**

| Path | Owns |
| --- | --- |
| [`src/lib/ledger.ts`](src/lib/ledger.ts) | Double-entry balance enforcement (`checkBalanced`) |
| [`src/lib/accounting.ts`](src/lib/accounting.ts) | Account trees, balances, and report math (P&L, balance sheet, trial balance) |
| [`src/lib/money.ts`](src/lib/money.ts) | Money (integer cents) and UTC date parsing/formatting |
| [`src/lib/periods.ts`](src/lib/periods.ts) | Reporting-period presets (date math; pure) |
| [`src/lib/business.ts`](src/lib/business.ts) | Active-business cookie + `requireBusiness()` |
| [`src/lib/auth.ts`](src/lib/auth.ts) | Optional password gate (session signing) |
| [`src/lib/actions.ts`](src/lib/actions.ts) | All Server Actions (every write goes here) |
| `src/app/**` | Routes (Server Components by default) |
| `src/components/**` | Reusable UI; client components are marked `"use client"` |

**How a request flows:**

- **Reads:** a page is a Server Component that calls `requireBusiness()`, queries
  Prisma scoped to that `businessId`, and renders. Everything is multi-business —
  always scope queries by `businessId`.
- **Writes:** a form posts to a Server Action in `actions.ts`. The action
  validates (ledger postings go through `checkBalanced`), writes via Prisma, then
  `revalidatePath()`s the affected routes. Mutating a journal entry also records
  an [audit event](src/lib/actions.ts).

**Cross-cutting features already built** (don't reinvent): the opt-in password
gate (`proxy.ts` + `auth.ts`), the journal-entry audit trail (`AuditEvent`), and
the database backup endpoint (`/api/backup`).

## Before you open a PR

Run the same checks CI will:

```bash
npm run lint
npm test
npm run build      # also type-checks
```

All three must pass. Add or update tests for any behavior you change.

## The rules that keep the books correct

These are not style preferences — breaking them produces wrong financials.

1. **Every ledger posting must balance and go through the check.** Debits must
   equal credits. All posting paths run their lines through `checkBalanced()` in
   [`src/lib/ledger.ts`](src/lib/ledger.ts). If you add a new way to create journal
   entries, it must use it too. Never write a `prisma.journalEntry.create` that
   bypasses validation.
2. **Money is integer cents.** Never store or compute money as floats. Parse user
   input with `parseMoney` and display with `formatMoney` ([`src/lib/money.ts`](src/lib/money.ts)).
3. **Dates are UTC calendar dates.** Use `parseDate` / `toDateInput`; don't
   introduce local-timezone `Date` math.
4. **Account balances are signed by normal balance.** Use `signedBalance` /
   `normalBalance` ([`src/lib/types.ts`](src/lib/types.ts)) rather than re-deriving signs.
5. **Pure accounting logic stays testable.** Keep computation (amortization,
   balance checks, report math) in modules free of `prisma` and `server-only` so it
   can be unit-tested. Database access lives in server actions and pages.

## Database migrations

- Schema changes are committed as Prisma migration files. Create one with
  `npm run db:migrate` (it targets the sandbox).
- **Migrations must be additive and data-preserving.** This app holds years of
  real financial history; a migration that drops or rewrites data is a serious
  bug. Prisma's auto-generated SQL sometimes recreates tables in a way that drops
  columns — review the generated SQL and hand-edit it to copy data across when
  needed (see existing migrations for examples).
- **Destructive migrations require maintainer review and a stated reason.**
- CI verifies every migration applies cleanly to an empty database.
- Never commit a `.db` file or any real financial data.

## What CI checks

On every push and PR: install, lint, unit tests, that all migrations apply to a
fresh database, and a full production build (which type-checks). Keep it green.

## Scope

Bug fixes and well-tested features are welcome. For larger changes, open an issue
first so we can agree on the approach before you build it.
