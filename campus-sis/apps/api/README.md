# @atlas/api — ATLAS Core

The modular-monolith API (NestJS + TypeScript). See the ADRs in
[`../../docs/adr/`](../../docs/adr/) for the locked stack decisions and
[`../../docs/06-architecture.md`](../../docs/06-architecture.md) for the shape.

## Quick start

```bash
# from campus-sis/
pnpm install
cp .env.example .env
pnpm db:up            # local Postgres via docker-compose
pnpm db:migrate       # apply SQL migrations (schema + RLS policies)
pnpm db:seed          # plan, platform admin, demo tenant + admin account
pnpm dev              # http://localhost:3000
```

Health: `GET /healthz` (liveness), `GET /readyz` (readiness incl. DB ping). The business API
lives under the `/api` prefix.

## What's in Phase 0 (this foundation)

- **Multi-tenancy with RLS** — every tenant-owned table has RLS enabled + forced; isolation is
  enforced by Postgres, not app code. See `src/database/rls.ts` and `migrations/0001_*.sql`.
- **Identity + RBAC schema** — `person`, `user_account`, `role`, `permission`,
  `role_assignment`, `relationship`, `service_indicator`.
- **Platform domain** — `tenant`, `plan`, `platform_user`, break-glass.
- **Cross-cutting** — `audit_log` (append-only), `event_outbox` + dispatcher worker, `config`,
  `document`.
- **Tooling** — config validation (Zod), structured logging (pino), money helpers (integer
  minor units), UUIDv7 ids, Jest tests (incl. the RLS isolation suite), CI.

## Not yet built (next PRs, still Phase 0)

Authentication (OTP/phone-first), RBAC enforcement guards + permission resolution, the
config/rules engine, academic structure (faculty→dept→programme), academic calendar, grading
schemes, and the platform admin console. Then Phase 1 (fees + registration).

## Layout

```
src/
  config/        env contract (zod), fail-fast on boot
  common/        money, ids, shared helpers
  database/
    schema/      Drizzle table definitions (typed client)
    migrations/  → ../migrations  (SQL source of truth, incl. RLS)
    rls.ts       withTenant() / withPlatform() — the ONLY way to touch tenant data
    migrate.ts   idempotent migration runner
    seed.ts      dev seed
  tenancy/       request context (ALS) + tenant-resolution middleware
  health/        liveness / readiness
  main.ts        HTTP entrypoint
  worker.ts      outbox dispatcher (separate process)
```

## The one rule

Any code path that reads or writes tenant-owned data goes through `withTenant()` or
`withPlatform()`. A raw pool query runs with no tenant context and RLS will (correctly) hide
everything. This is deliberate — it's what makes a cross-tenant leak impossible.
