# FinScope

Household and business financial tracking. Manual entry and CSV import today,
structured so bank connections, budgets, goals, forecasting and mobile can be
added without reshaping the data model.

Working name only — branding lives in `apps/web/app/globals.css` and can be
changed in one file.

## What works right now

- Household and business workspaces, switchable, with a combined net-worth view
- Manual accounts (assets and liabilities) with balances
- Manual transaction entry with automatic category suggestion
- CSV / bank-export import: column mapping, date-format detection, duplicate
  detection, per-row preview, and one-click undo
- Transaction ledger with search, filtering, inline recategorising, and
  one-click household/business reclassification
- Monthly category budgets with progress, projections and recommended daily spend
- Business P&L: net revenue, COGS, gross profit, operating expenses, net profit,
  margin, tax-deductible totals, revenue concentration
- Light and dark themes, keyboard navigation, reduced-motion support

## What is scaffolded but not built

The database schema, security model and shared calculation library already cover
the full spec. The UI does not yet expose: bank connections (Plaid), goals,
forecasting, recurring/subscription detection, collaborators, notifications,
reports, Stripe billing, the admin panel, or the mobile app. Each has tables,
policies and in most cases calculations ready.

## Layout

```
packages/db       Postgres schema, migrations, RLS policies, security tests
packages/core     Shared financial calculations, CSV parsing, rules engine
apps/web          Next.js application
apps/mobile       Reserved for Expo / React Native
```

`packages/core` is deliberately framework-free so web and mobile compute
identical numbers from identical code.

## Running it

```bash
npm install
npm run dev --workspace @finscope/web
```

Open http://localhost:3000. It runs with **no configuration** — data is kept in
your browser so you can try the whole flow immediately. The header shows
"Local mode" when this is the case.

### Connecting the real backend

1. Create a project at supabase.com.
2. Copy `.env.example` to `.env.local` and fill in the URL, anon key and
   `DATABASE_URL`.
3. Apply the schema:

```bash
npm run db:migrate
```

The app switches to Supabase automatically once the environment variables are
present.

## Tests

```bash
npm test --workspace @finscope/core   # 48 calculation and parsing tests
npm test --workspace @finscope/db     # 22 security and integrity tests
```

The database tests spin up a real Postgres in-process (PGlite), apply every
migration, and assert that one user cannot read another's data. They need no
running database and no credentials.

## Money

All amounts are exact decimals — `NUMERIC(20,4)` in Postgres, BigInt minor units
in TypeScript. Never floating point. `0.1 + 0.2 !== 0.3` is not an acceptable
property for a ledger, and the `Money` class exists to make that impossible.
