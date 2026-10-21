# ADR-0003 — Hosting: Render/Railway to start, residency-ready later

- **Status:** Accepted (2026-10-20)
- **Deciders:** Whale
- **Resolves (partially):** Q-ARCH-2

## Decision

Deploy the pilot on a **managed PaaS — Render** (Railway is an equivalent fallback): managed
Postgres, the API web service, and the outbox worker, provisioned from `render.yaml`. Defer
in-Nigeria data residency to a later dedicated tier.

## Rationale

- A two-person team should spend its hours on product, not ops. Render gives managed Postgres,
  containers, workers, cron, TLS, health checks and zero-downtime deploys with almost no setup.
- The `render.yaml` blueprint makes the whole stack reproducible and one-click.
- Residency is not a day-one blocker for a private-university design partner (the recommended
  beachhead, Q-GTM-1). The data model already supports per-tenant region placement
  (architecture §3), so a flagship tenant requiring in-country hosting is promoted to the
  dedicated tier **without an application rewrite**.

## Consequences

- No Nigerian region at the PaaS tier initially; latency mitigated by the mobile-first,
  low-bandwidth client design (small, compressed, offline-tolerant).
- Migration path if we outgrow the PaaS or need residency: the same container + managed
  Postgres shape lifts to AWS `af-south-1` (Cape Town) or an in-country provider. The
  Dockerfile keeps us provider-agnostic.
- Harden Postgres TLS to `verify-full` once the provider's CA is pinned (currently
  `rejectUnauthorized: false` in prod).
