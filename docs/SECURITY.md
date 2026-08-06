# Security model

## The core claim

Every client — web, iOS, Android — connects to Postgres directly with the user's
own JWT. There is no trusted middle tier filtering rows. **Row-level security is
the entire access-control system.** If a policy is wrong, one user reads
another's bank ledger.

That is why `packages/db/migrations/0010_row_level_security.sql` is the most
important file in the repository, and why `packages/db/tests/isolation.test.mjs`
asserts the boundary rather than trusting it.

## What is enforced, and verified by test

| Control | Test |
|---|---|
| A user cannot read another user's transactions, accounts or workspaces | ✓ |
| A user cannot write into a workspace they know the UUID of | ✓ |
| Viewers can read but not write | ✓ |
| Contributors can edit only rows they created | ✓ |
| An admin cannot promote themselves to owner | ✓ |
| A user cannot grant themselves platform admin | ✓ |
| Encrypted bank tokens are unreadable by every client role | ✓ |
| Per-member account scoping hides out-of-scope accounts *and* their transactions | ✓ |
| A workspace always retains at least one owner | ✓ |
| Split transactions must sum exactly to their parent | ✓ |
| Duplicate imports are rejected at the database level | ✓ |

Run them with `npm test --workspace @finscope/db`.

## Defence in depth on banking credentials

Bank tokens get two independent controls, because one is not enough:

1. **Row level** — RLS decides which connection rows you may see.
2. **Column level** — `access_token_encrypted` and `token_nonce` are *never
   granted* to `anon` or `authenticated`. A column grant is checked by the
   executor itself, so no future policy mistake can re-expose the token.

Only edge functions holding the service role can read them, and only they hold
the decryption key. Raw bank usernames and passwords are never stored in any
form — Plaid Link means the application never sees them.

## Append-only audit

`audit_logs` and `security_events` have a SELECT policy and nothing else. No
client role — including a workspace owner — has UPDATE or DELETE. An attacker
who compromises an owner account still cannot erase the trail.

## Deliberate design decisions worth knowing

**Workspace creation is an RPC, not an insert.** `create_workspace()` is
`SECURITY DEFINER` and atomically creates the workspace, the owner membership
and the preferences row. A plain client insert would also fail in a subtle way:
`RETURNING` is evaluated before AFTER-INSERT triggers fire, so the creator's
membership row does not exist yet and the SELECT policy rejects the returned
row. This was caught by running the migrations, not by reading them.

**Grants are declared explicitly.** Supabase grants table privileges to
`authenticated` by default. Relying on that implicit default would make the
access model invisible in review and would break on self-hosted Postgres.

**Helper functions pin `search_path`.** Without it, a caller could shadow
`public` and hijack name resolution inside a `SECURITY DEFINER` body.

## Not yet done

Do not claim any compliance certification until it has actually been audited.
Outstanding before handling real financial data:

- Rate limiting and brute-force protection on auth endpoints
- Session revocation and device management UI
- Encryption-key rotation procedure
- Backup and restore testing
- Penetration test
- Plaid production security review (allow several weeks)
