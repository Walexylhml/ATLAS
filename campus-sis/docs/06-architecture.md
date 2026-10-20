# 06 — High-Level Architecture

This document records the **architectural direction** and the reasoning behind it. It is a
starting position for a two-person build, deliberately biased toward **boring, proven,
managed technology** and a **small-team-friendly** shape. Detailed ADRs (Architecture
Decision Records) will live in `docs/adr/` as decisions are locked.

---

## 1. Architectural principles

1. **Modular monolith first, not microservices.** One deployable application, internally
   organised into clear domain modules with enforced boundaries. A two-person team should not
   pay the operational tax of microservices. Split a module into a service *only* when scale
   or isolation genuinely demands it (results compute, notifications are the likely first
   candidates).
2. **API-first.** The core exposes a clean API; every client (student PWA, staff console,
   admin, platform) is a consumer. No business logic in the clients.
3. **Configuration-driven core.** Institutional variance is data (see data model), resolved
   at runtime by a configuration/rules layer — the key to serving every institution type
   without forking.
4. **Multi-tenant from day one.** Tenancy is in the data model, the auth layer, and every
   query. Retrofitting tenancy later is a rewrite; we don't.
5. **Correctness-critical cores are isolated and exhaustively tested.** The CGPA engine and
   the financial ledger are pure, well-tested modules with explicit invariants.
6. **Offline/low-bandwidth is an architectural concern, not a UI afterthought** (sync,
   idempotency, outbox).

## 2. System shape

```
        ┌───────────── Clients (all API consumers) ─────────────┐
        │  Student/Parent PWA  │  Staff console  │  Admin  │ Platform console │
        └───────────┬──────────┴────────┬────────┴────┬────┴─────────┬───────┘
                    │  HTTPS (small, compressed, idempotent)          │
            ┌───────▼─────────────────────────────────────────────────▼──────┐
            │                      API Gateway / Edge                          │
            │     auth, rate-limit per tenant, TLS, compression, CDN cache     │
            └───────────────────────────────┬──────────────────────────────── ┘
                                             │
            ┌────────────────────────────────▼───────────────────────────────┐
            │                 ATLAS Core (modular monolith)                    │
            │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
            │  │ Identity │ │Admissions│ │ Records  │ │ Results  │  …modules…  │
            │  │ & RBAC   │ │          │ │  & Reg   │ │ & CGPA   │            │
            │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
            │       └─ Config/Rules engine · Tenant context (RLS) ─┘           │
            │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
            │  │Financials│ │Auxiliary │ │  Comms   │ │ Platform │            │
            │  │ (ledger) │ │          │ │          │ │  admin   │            │
            │  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
            └───┬─────────────┬───────────────┬──────────────┬───────────────┘
                │             │               │              │
        ┌───────▼───┐  ┌──────▼─────┐  ┌──────▼──────┐ ┌─────▼────────┐
        │ PostgreSQL│  │  Object    │  │ Queue/Jobs  │ │ Integrations │
        │ (RLS,     │  │  storage   │  │ + Outbox    │ │ JAMB/CAPS,   │
        │ replicas) │  │ (documents)│  │ dispatcher  │ │ Remita/Pay…, │
        └───────────┘  └────────────┘  └─────────────┘ │ SMS/email    │
                                                        └──────────────┘
```

## 3. Multi-tenancy strategy (hybrid)

| Tier | Isolation | For |
|---|---|---|
| **Shared schema + RLS** | One database, `tenant_id` on every row, PostgreSQL Row-Level Security enforces isolation. | The long tail — small/medium institutions. Cheapest, simplest to operate. |
| **Schema-per-tenant** | Separate schema in a shared cluster. | Larger institutions wanting stronger isolation / custom retention. |
| **Database-per-tenant** | Dedicated database (even dedicated region). | Flagship federal universities with data-residency/isolation mandates. |

The **logical data model is identical** across tiers (doc 04), so a tenant can be promoted
from shared → schema → dedicated without an application rewrite. This is the pragmatic answer
to "serve everyone" without over-engineering for day one.

**Data residency:** deploy in a region/provider with Nigerian presence or in-country hosting
for tenants that require it; the dedicated tier supports per-tenant region placement.

## 4. Technology direction (indicative — to be locked via ADR)

> Bias: pick what the (small) team is most productive in and what is boring and proven.
> These are recommendations, not commitments.

- **Database:** **PostgreSQL** — RLS for tenancy, strong constraints, JSONB for config,
  partitioning, mature ecosystem, excellent correctness story. This is a firm recommendation.
- **Backend:** a single strongly-typed stack — e.g. **TypeScript/Node (NestJS)** *or*
  **Python (Django/FastAPI)** *or* **Java/Kotlin (Spring)**. Decision factor: founder/team
  fluency and hiring pool. Modular monolith regardless of choice.
- **Client:** **PWA** — a modern framework kept lean (e.g. React/Svelte) with a service
  worker for offline; strict performance budget for low-end Android.
- **Jobs/queue:** a managed queue + worker for async (result compute, notifications,
  reconciliation) with the transactional outbox pattern.
- **Object storage:** S3-compatible for documents/photos.
- **Infra:** managed/PaaS where possible (managed Postgres, managed container platform) to
  minimise ops for a two-person team; infrastructure-as-code from the start.
- **Observability:** structured logging + metrics + tracing + error tracking (managed).

## 5. Integration layer

A pluggable adapter pattern so each external system sits behind an internal interface:

- **Payments:** `PaymentGateway` interface with adapters for **Remita, Paystack, Flutterwave,
  Interswitch**. Signed webhooks + reconciliation polling; idempotent posting to the ledger.
- **Admissions:** **JAMB/CAPS** intake — file-based import first (realistic), API if/when
  available.
- **Messaging:** `NotificationChannel` interface — SMS (local aggregators), email, push,
  with fallback ordering for weak networks.
- **LMS:** integration hooks (not a rebuild) for Moodle/Canvas later.
- **Identity:** SSO (SAML/OIDC) adapters for institutions that have it.

## 6. Offline & sync architecture

- **Client:** service worker caches app shell + the user's own critical data (registration,
  results, fees). Writes are queued locally with client-generated idempotency keys.
- **Sync:** on reconnect, queued writes replay against idempotent endpoints; server is
  authoritative; conflicts surface explicitly (never silent overwrite).
- **Server:** idempotency keys on all mutating endpoints; outbox for reliable side effects.

## 7. Environments & delivery

- **Environments:** local → staging → production, with seed/fixture data for tests.
- **CI/CD:** automated tests + linting + type checks + security scans gate every merge;
  zero-downtime deploys; backward-compatible, reversible migrations.
- **Branching:** trunk-based with short-lived branches; **PRs opened on GitHub for review and
  manual commit/merge approval** (per project working style).

## 8. What we are explicitly NOT doing (and why)

- **Not** microservices up front — operational cost unjustified for two people.
- **Not** a bespoke per-school codebase — the whole thesis is configuration over forking.
- **Not** rebuilding an LMS, library ILS, or ERP finance — integrate instead.
- **Not** floats for money, not mutable balances, not destructive deletes — see data model.

## 9. Open architectural decisions

Tracked in [`08-open-questions.md`](08-open-questions.md): backend language/framework lock,
hosting provider & data-residency approach, PWA framework, SMS aggregator(s), and the
JAMB/CAPS integration mechanism.
