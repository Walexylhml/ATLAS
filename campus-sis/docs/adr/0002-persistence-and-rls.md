# ADR-0002 — Persistence: PostgreSQL, Drizzle, and SQL-first RLS migrations

- **Status:** Accepted (2026-10-20)
- **Deciders:** Whale, Claude
- **Confirms:** D-2 (PostgreSQL)

## Decision

1. **PostgreSQL** is the primary database.
2. **Drizzle ORM** is the typed query layer in the app.
3. **Hand-written SQL migrations** in `apps/api/migrations/` are the **source of truth** for
   DDL — including Row-Level Security policies. A tiny runner (`migrate.ts`) applies them in
   order, once each, idempotently.
4. **Tenant isolation is enforced by the database** via RLS, not by application code.

## Context

The whole multi-tenancy thesis rests on tenant isolation being impossible to violate by an
application bug (architecture §3, data-model principle #1). That pushes isolation down into
Postgres RLS. ORMs that pool connections (e.g. Prisma) make per-request session variables
unreliable, and ORM migration generators do not emit RLS policies.

## Rationale

- **RLS + `FORCE ROW LEVEL SECURITY`** means even the table owner is subject to the policy, so
  isolation holds regardless of which role the app connects as — portable across local Postgres
  and managed providers where you may only get one role.
- **Transaction-scoped context.** `withTenant()` / `withPlatform()` (`src/database/rls.ts`)
  open a transaction and `set_config('app.current_tenant', …, true)` — `SET LOCAL`, so a
  pooled connection can never carry one tenant's context into another's query.
- **Null-safe casts.** Policies use `NULLIF(current_setting('app.current_tenant', true), '')`
  because a custom GUC reverts to `''` (not NULL) after a `SET LOCAL`; the RLS test suite
  (`rls.spec.ts`) proves isolation and the WITH CHECK guard against cross-tenant writes.
- **SQL-first migrations** keep RLS, partial indexes and constraints explicit and reviewable.
  Drizzle stays the typed client; `drizzle-kit` is used only to generate candidate SQL during
  development (output to `migrations/_generated`, never auto-applied).

## Consequences

- The Drizzle schema (`src/database/schema/`) and the SQL migrations must be kept in sync by
  hand for now. Acceptable at Phase 0; revisit adopting `drizzle-kit generate` + an RLS
  post-step once the schema stabilises.
- Every code path touching tenant data **must** go through `withTenant`/`withPlatform`. Direct
  pool queries bypass the context and will see nothing (or fail WITH CHECK) — by design.
- Production should still connect as a dedicated non-owner role as defence-in-depth, even
  though FORCE RLS makes correctness independent of it.
