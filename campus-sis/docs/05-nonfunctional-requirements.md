# 05 — Non-Functional Requirements (NFRs)

The NFRs are where ATLAS wins or loses. The functional features are table stakes; the product
is judged on whether it works **on a cheap Android phone, on bad network, during peak load,
without ever losing money or corrupting a result.**

---

## 1. Network resilience (weak/intermittent connectivity) — **top priority**

| ID | Requirement |
|---|---|
| NFR-NET-1 | Assume **2G/3G and intermittent signal** as the baseline, not the exception. Design every critical flow to tolerate dropped connections mid-action. |
| NFR-NET-2 | **Small payloads.** Aggressive compression (Brotli/gzip), minimal JSON, pagination, no over-fetching. Target critical API responses < 50 KB. |
| NFR-NET-3 | **Idempotent, resumable writes.** Registration, score entry, and payment can be retried safely after a drop (idempotency keys end-to-end). |
| NFR-NET-4 | **Offline-capable key flows** via PWA + service worker: a student can view their registration, results, and fee status offline; a lecturer can prepare score entry offline and sync when connected. |
| NFR-NET-5 | **Optimistic UI with safe sync**: queue writes locally, reconcile on reconnect, surface conflicts clearly — never silently overwrite. |
| NFR-NET-6 | **Graceful degradation**: if a feature needs connectivity it can't get, fail clearly with a retry, never a blank screen or lost input. |
| NFR-NET-7 | **USSD/SMS fallback** for the most critical notifications (fee deadline, result published) where data is unavailable. |
| NFR-NET-8 | Assets cached and versioned; app shell loads instantly after first visit. |

## 2. Mobile-first experience

| ID | Requirement |
|---|---|
| NFR-MOB-1 | **Mobile-first, responsive** design; the phone is the primary device, desktop secondary. |
| NFR-MOB-2 | **PWA** (installable, offline shell, push) as the default student/parent client; avoids app-store friction and works on low storage. Native wrapper only if push/again later demands it. |
| NFR-MOB-3 | Works on **low-end Android** (≤2 GB RAM, older WebView); modest JS footprint; no heavy frameworks on critical paths. |
| NFR-MOB-4 | **Data-saver mode**: text-first, lazy images, optional media. |
| NFR-MOB-5 | Touch-first ergonomics; large targets; forms optimised for phone keyboards and OTP autofill. |
| NFR-MOB-6 | Performance budget: **p95 interactive < 5 s on 3G / low-end device**; core pages usable < 3 s on first contentful paint. |

## 3. Performance & scalability

| ID | Requirement |
|---|---|
| NFR-PERF-1 | **Peak-load design** for registration/results windows — the moments every student hits the system at once. Target: 99%+ of registration attempts complete during peak. |
| NFR-PERF-2 | **Queue/throttle** heavy operations (bulk result compute, mass notifications) off the request path. |
| NFR-PERF-3 | Horizontal scalability of the application tier; stateless app servers behind a load balancer. |
| NFR-PERF-4 | Read replicas for reporting; expensive exports never touch the primary. |
| NFR-PERF-5 | Multi-tenant fairness: one tenant's load spike cannot starve others (rate limits/quotas per tenant). |
| NFR-PERF-6 | API p95 latency < 500 ms for interactive endpoints under normal load. |

## 4. Reliability & availability

| ID | Requirement |
|---|---|
| NFR-REL-1 | **≥ 99.9% uptime** during academic peak periods; defined maintenance windows otherwise. |
| NFR-REL-2 | **No single point of failure** in the critical path (DB with replicas/failover, redundant app instances). |
| NFR-REL-3 | **Backups**: automated, encrypted, tested restores; point-in-time recovery for the database. |
| NFR-REL-4 | **Disaster recovery**: documented RPO ≤ 15 min, RTO ≤ 4 h targets (refine per tenant SLA). |
| NFR-REL-5 | **Transactional outbox** guarantees side effects (notifications, reconciliation) survive crashes. |
| NFR-REL-6 | Zero-downtime deploys; backward-compatible migrations. |

## 5. Security

| ID | Requirement |
|---|---|
| NFR-SEC-1 | **Encryption in transit** (TLS everywhere) and **at rest** (database, backups, object storage). |
| NFR-SEC-2 | **Least privilege** throughout; default-deny RBAC (see doc 02); tenant isolation via RLS. |
| NFR-SEC-3 | **MFA** for all staff privileged roles and all platform accounts; step-up re-auth for sensitive actions (grade change, refunds, PII export, break-glass). |
| NFR-SEC-4 | **Secrets management** (no secrets in code/repo); rotated credentials; scoped API keys for integrations. |
| NFR-SEC-5 | **Field-level protection** for the most sensitive PII; tokenisation where appropriate. |
| NFR-SEC-6 | **Audit logging** of all sensitive reads/writes; tamper-evident, append-only. |
| NFR-SEC-7 | **Input validation / output encoding**; protection against OWASP Top 10 (injection, XSS, CSRF, SSRF, broken access control). |
| NFR-SEC-8 | **Rate limiting & abuse protection** on auth and public endpoints; bot/credential-stuffing defences. |
| NFR-SEC-9 | **Payment security**: never store raw card data; rely on PCI-compliant gateways; webhooks signed & verified. |
| NFR-SEC-10 | Regular dependency scanning, SAST, and periodic penetration testing. |

## 6. Data protection & compliance (NDPA 2023)

| ID | Requirement |
|---|---|
| NFR-DP-1 | **NDPA-compliant by design**: lawful basis, purpose limitation, data minimisation, retention limits. |
| NFR-DP-2 | **Data-subject rights**: access, rectification, erasure, portability — as controlled, audited workflows. |
| NFR-DP-3 | **Consent management** where required (e.g. parent academic visibility for adult students). |
| NFR-DP-4 | **Data residency**: ability to host tenant data within Nigeria where required (see architecture). |
| NFR-DP-5 | **Breach detection & notification** processes aligned to NDPA timelines. |
| NFR-DP-6 | **DPO role** and tooling at platform level; per-tenant data-processing agreements. |
| NFR-DP-7 | Tenant owns its data; clear export and deletion on offboarding. |

## 7. Usability & accessibility

| ID | Requirement |
|---|---|
| NFR-UX-1 | Clear, low-literacy-friendly flows; plain language; minimal jargon. |
| NFR-UX-2 | **WCAG 2.1 AA** targets; screen-reader support; sufficient contrast. |
| NFR-UX-3 | English primary; architecture allows future localisation (i18n-ready). |
| NFR-UX-4 | Consistent design system across all portals (student, staff, admin, platform). |
| NFR-UX-5 | Helpful empty/error/offline states; never dead ends. |

## 8. Maintainability & quality (the "prioritise quality" mandate)

| ID | Requirement |
|---|---|
| NFR-Q-1 | **Automated tests** are mandatory: unit, integration, and end-to-end for critical flows (registration, results, money). Correctness-critical logic (CGPA engine, ledger) has exhaustive tests. |
| NFR-Q-2 | **CI pipeline**: every change runs tests, linting, type checks, security scans before merge. |
| NFR-Q-3 | **Code review** on every change (even solo — PR discipline, self-review, AI review). |
| NFR-Q-4 | **Typed, documented** codebase; clear module boundaries (see architecture). |
| NFR-Q-5 | **Migrations are versioned, reversible, and reviewed**; no manual prod DB edits. |
| NFR-Q-6 | **Observability**: structured logging, metrics, tracing, error tracking, alerting. |
| NFR-Q-7 | **Golden correctness invariants** continuously checked in production (e.g. ledger sums to zero per account, no result visible pre-publication, no orphaned enrollments). |
| NFR-Q-8 | Documentation kept current in this repo; decisions recorded (ADRs). |

## 9. Observability & operations

| ID | Requirement |
|---|---|
| NFR-OPS-1 | Centralised structured logs (tenant-tagged), searchable. |
| NFR-OPS-2 | Metrics & dashboards: latency, error rate, saturation per service and per tenant. |
| NFR-OPS-3 | Distributed tracing across API → service → DB. |
| NFR-OPS-4 | Alerting on SLO breaches, payment-reconciliation exceptions, auth anomalies. |
| NFR-OPS-5 | Runbooks for incidents; on-call process as the platform grows. |

## 10. Cost efficiency

| ID | Requirement |
|---|---|
| NFR-COST-1 | Infrastructure cost scales with tenants/usage; managed services preferred over self-hosted ops given the small team. |
| NFR-COST-2 | Efficient multi-tenancy (shared infra for small tenants) keeps per-tenant cost low enough to serve the market's price point. |
| NFR-COST-3 | Metering per tenant to inform pricing and catch runaway usage. |
