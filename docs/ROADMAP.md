# Roadmap

Honest sequencing for the full specification. Estimates assume one experienced
full-stack developer working steadily; a team of three does not go three times
faster, but roughly halves it.

## Done

**Phase 1 — Foundation.** Monorepo, 47-table schema, 153 RLS policies, role
model, migration runner, design system, shared calculation library. Verified:
22 security tests, 48 calculation tests, clean production build.

**Phase 2 (partial) — Financial core.** Accounts, transactions, categories,
manual entry, CSV import with duplicate detection and undo, rules engine.

## Next

**Wire the Supabase adapter** (~1 week). The UI already talks to one interface;
this replaces the local adapter with real queries plus auth screens. Do this
before building more features, so nothing else is written against local storage.

**Auth and onboarding** (~2 weeks). Email/password, Google, Apple, MFA, the
six-step onboarding flow, workspace creation, invitations.

**Budgets, recurring detection, subscriptions** (~3 weeks). Budget periods and
rollover are already modelled; recurring detection is the substantial piece.

**Goals, forecasting, net worth, reports** (~4 weeks). Goal maths is written and
tested. Forecasting is the largest single unbuilt feature — three scenarios,
adjustable assumptions, and it must never present an estimate as a certainty.

**Plaid integration** (~3 weeks of work, but start the paperwork now). Sandbox
first. Production access needs a company entity and Plaid's security review, and
that review is measured in weeks, not days. It is the longest-lead item in the
project.

**Collaboration** (~2 weeks). Roles and scoping are enforced already; this is
invitations, comments, review requests and the audit-log UI.

**Mobile** (~6 weeks). Expo app consuming `packages/core` unchanged. Note that
Framer Motion does not carry over — mobile animation is a separate build.

**Stripe billing, admin panel, notifications** (~4 weeks).

**Hardening before real money** (~3 weeks). Rate limiting, penetration test,
backup/restore drill, accessibility audit, load testing.

## Realistic total

Roughly **seven to nine months** for one developer to reach the full spec at a
quality where you would let strangers put real bank accounts into it. The
Phase 1 foundation is the part that is expensive to get wrong later, which is
why it was built first and tested hardest.

## Sequencing advice

Ship the manual + CSV product to a small group before Plaid. It is genuinely
useful on its own, it surfaces category and UX problems while they are cheap to
fix, and it gives you real usage data to design the automated flows against.
Adding bank sync to a product people already use is far easier than launching
both at once.
