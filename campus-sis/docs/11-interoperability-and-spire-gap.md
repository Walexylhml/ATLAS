# 11 — Interoperability, Integrations & the SPIRE Gap Analysis

> **Why this document exists.** ATLAS is inspired by the *integration philosophy* of Oracle
> PeopleSoft Campus Solutions (the system behind UMass Amherst's **SPIRE**). This document
> does two things: (1) it records, honestly, what SPIRE/PeopleSoft covers that ATLAS does
> **not** yet — so nothing is quietly forgotten — and (2) it sets the **interoperability
> architecture** so that everything we build is API-first and ready to exchange data with
> other school systems, generate verifiable transcripts, and move results and records
> **securely between institutions**. It is a living planning doc; code lands against it phase
> by phase. It does not change any shipped behaviour on its own.

This doc assumes the current build: a NestJS modular monolith with PostgreSQL + RLS,
per-request tenant context, RBAC/ABAC with a `tenant ⊃ school ⊃ faculty ⊃ department ⊃
self` scope ladder, HMAC (HS256) access tokens minted in `TokenService`, and the
cross-cutting tables already present — `audit_log`, `event_outbox`, `document`, `config`.
The integration design below is deliberately built **on those existing primitives** rather
than inventing new infrastructure.

---

## Part A — SPIRE / PeopleSoft Campus Solutions gap analysis

The goal is **not** to clone SPIRE. It is to match its *integration depth* — one student
identity every module reads from — while fitting the Nigerian lifecycle (JAMB/CAPS, NYSC,
NUC, carryover/resit). Most of what SPIRE does is already sequenced in the roadmap
(`docs/07`); the point of this section is to separate **genuine omissions** (nowhere in any
phase) from **deferred** work and from US-specific features we are **right to skip**.

### A.1 Genuine omissions — in SPIRE, in no ATLAS phase yet

These should be added to the roadmap explicitly rather than discovered during a pilot.

| # | Capability | What SPIRE does | What ATLAS has today | Impact |
|---|-----------|-----------------|----------------------|--------|
| 1 | **Class scheduling / timetabling** | Meeting patterns (days/times), room & facility assignment, instructor workload, **time-conflict detection** | An offering says only "this course runs this session" (`course_offering`) | High — without it you cannot detect a student's clashing courses or a double-booked room |
| 2 | **Waitlists, capacity enforcement & registration appointments** | Enforced seat limits, waitlists with auto-promotion, **enrollment appointments / time tickets** (staggered registration windows) | `course_offering.capacity` exists but is **not enforced**; no waitlist; no windows | High — registration is a toy without seat limits and staggering, both of which Nigerian institutions rely on |
| 3 | **Transfer credit / advanced standing / equivalency** | Evaluate and credit courses taken elsewhere; test/AP credit; course equivalency rules | Nothing | High in Nigeria — direct entry, IJMB/JUPEB, inter-university transfer are common |
| 4 | **3C engine — Communications, Checklists, Comments** | Structured checklists (registration/clearance/admission), a person communications log, staff comments | Notifications are planned (Phase 1) but **checklists/comments are not** | Medium–High — clearance and admission flows are checklist-shaped |
| 5 | **Student groups / cohorts** | Ad-hoc populations (scholarship holders, athletes, honours, sponsored) that drive fees, rules & reporting | Nothing | Medium — needed for differential fees, scholarships, cohort reporting |
| 6 | **Program-stack depth** | `career → program → plan (major) → subplan (concentration)`, double majors, minors | Flattened to a single `programme` | Medium — combined-honours and the UG/PG split don't fit cleanly today |
| 7 | **Advisor assignment & advising** | Advisor→student mapping, advisee lists, advising notes | `is_my_advisee` predicate is **stubbed**; no mapping table | Medium — blocks adviser-scoped features |
| 8 | **Milestones (postgraduate)** | Comprehensive exams, proposal, thesis defence tracking | Nothing | Medium for research-heavy universities |
| 9 | **Attendance** | Class attendance rosters | Nothing | Medium — in Nigeria often **gates exam eligibility** (~75%), so it couples to results + registration |

Minor: PeopleSoft **positive** service indicators (privileges, not just holds) — our
`indicator_polarity` enum already allows `positive`, only negative holds are implemented.

**First-to-bite for a pilot:** #1 and #2 make registration *real*; they are arguably
**Phase 1 gaps**, not future phases. #3 and #6 bite the moment a real catalogue and real
admissions data arrive.

### A.2 Deferred — in SPIRE and already in the ATLAS roadmap (not omissions)

Results/grading/transcripts, CGPA & academic standing, the senate approval chain, degree
audit/advisement reports, admissions intake, refunds/waivers/scholarships, graduation &
conferral, analytics & dashboards. See `docs/07` and `docs/10`.

### A.3 Rightly skipped — US-specific PeopleSoft baggage

FAFSA/ISIR financial aid, 1098-T tax reporting, SEVIS international-student visa reporting,
US veterans' benefits. Building these would be waste for the target market.

### A.4 The inverse — what ATLAS covers that SPIRE does not

JAMB/CAPS intake, NYSC mobilisation, NUC regulatory returns, Nigerian carryover/resit
semantics, matriculation-number schemes. ATLAS matches SPIRE's depth **and** fits the
local lifecycle.

---

## Part B — Interoperability architecture (build everything to be integrateable)

The design rule: **every capability is an API first, a screen second.** The web/PWA clients
are just the first consumers of the same contracts a partner institution, an LMS, or a
government system will consume. Three audiences drive the design:

1. **First-party clients** — the staff web app and the student PWA.
2. **Partner systems** — other schools, an LMS (Moodle/Canvas), payment and identity
   providers, government portals (JAMB, NUC, NYSC).
3. **Third parties with a one-time need** — an employer or embassy verifying a transcript,
   an external examiner uploading results, a receiving school importing a transfer student.

### B.1 API surface & versioning

- **Versioned, stable contracts.** All routes live under `/api/v1`. A breaking change means
  `/api/v2`; `v1` keeps working. External integrators pin a version.
- **Stable external IDs & idempotency.** Every externally-referenced record exposes a
  durable id; every write endpoint accepts an idempotency key so a retried integration call
  never double-posts (we already do this for payment reconciliation — generalise it).
- **Read models over raw tables.** Integrators consume purpose-built read endpoints (as the
  reporting module already does), never the physical schema — so internal refactors don't
  break partners.
- **Tenant isolation preserved end-to-end.** Every external call resolves to exactly one
  tenant; RLS still runs. A partner credential is scoped to its institution and can never
  read across tenants.

### B.2 Partner authentication (institution-to-institution)

Human sessions use the existing OTP + HMAC access-token flow. **Machine** integrations get a
separate path:

- **Per-institution API credentials** — an OAuth2 *client-credentials* grant (client id +
  secret, or a signed JWT assertion) issued per partner, exchangeable for a short-lived
  access token. Reuses the `TokenService` signing discipline already in place.
- **Scopes, not roles.** A credential carries explicit scopes (e.g. `transcripts:read`,
  `results:write`, `students:transfer`) — least privilege, independent of staff roles.
- **Rate limits & rotation.** Per-credential limits; secrets rotate without downtime.

### B.3 Outbound events & webhooks

The `event_outbox` table already exists for exactly this. Formalise it as the integration
backbone:

- Domain events (invoice issued, payment reconciled, result published, student transferred)
  are written to `event_outbox` in the **same transaction** as the state change — no lost
  events, no dual-write race.
- A dispatcher drains the outbox and delivers to subscribers: **signed webhooks** (HMAC over
  the payload so the receiver can verify authenticity) with retries and a dead-letter trail.
- Partners subscribe to event types relevant to them (an LMS to enrolment events, a sponsor
  to invoice/payment events).

### B.4 Data portability & standards

Adopt open standards where they are pragmatic, so ATLAS speaks the same language as other
systems instead of a bespoke dialect:

- **Course & enrolment exchange:** **OneRoster** (IMS Global) for LMS roster sync.
- **Transcripts & records exchange:** **PESC** (XML/JSON) as the canonical shape for
  academic records moving between institutions; fall back to a documented ATLAS JSON schema
  where a counterparty can't do PESC.
- **Identity:** SSO via **OIDC/SAML** for staff where an institution already has an IdP.
- Everything is also available as plain versioned JSON for partners who integrate directly.

### B.5 The transcript service (verifiable by design)

Transcripts are the highest-value cross-institution artifact, so they are built for
verification from day one — not as a PDF someone can photoshop.

- **Canonical transcript model** derived from the results module (Phase 2): programme, terms,
  courses, grades, GPA/CGPA, degree classification, academic standing.
- **Official vs unofficial.** Unofficial is a self-service read. Official is a **signed
  artifact**: a document (stored in the `document` table) plus a **digital signature** over
  its canonical content, issued by the institution's key.
- **Verification endpoint + QR.** Every official transcript carries a QR / short URL to a
  public verification endpoint that re-checks the signature and shows the authoritative
  record — so a receiver trusts the data, not the paper.
- **Enrollment-verification letters** follow the same signed-artifact pattern.

---

## Part C — Secure cross-institution links (the capability-token primitive)

This is the mechanism behind "generate a secure link so another school can upload results,
or receive/transfer a student's records, or verify a transcript." One primitive serves them
all: a **signed, scoped, expiring capability token**, delivered as a URL, that grants a
*specific* action on a *specific* subject to a *specific* audience — with no account required
and every use audited.

### C.1 Use cases

1. **External result upload** — an external examiner or a partner school uploads a result set
   for a named cohort/course, through a link, without an ATLAS account.
2. **Outbound transfer** — send a transfer student's verified records *to* a receiving school.
3. **Inbound transfer** — receive and stage records *from* another school for transfer-credit
   evaluation (gap A.1 #3).
4. **Transcript sharing / verification** — hand an employer or embassy a link that proves a
   transcript is authentic and current.

### C.2 How the token works

A capability token is **not** a session and carries **no standing permission**. It is a
one-purpose grant:

- **Signed**, using the existing `node:crypto` HMAC discipline from `TokenService` (move to
  asymmetric keys when a counterparty must verify our signature without sharing a secret).
- **Scoped** to a single purpose and subject: `{ purpose: "result-upload", tenant, scope:
  {offeringId}, audience, permissions: ["results:write"] }` — least privilege, nothing more.
- **Short-lived** (minutes–days as the purpose dictates) and **single-use or
  count-limited**, tracked by a server-side nonce so a leaked link can't be replayed.
- **Server-side referenced.** The URL carries an opaque token; the sensitive grant lives in
  the database. **No PII, no record ids in the query string** (consistent with the platform
  privacy rule). The link is safe to email.
- **Revocable.** A grant can be cancelled before expiry; revocation is immediate.
- **Audited.** Issue, each use, and revocation are written to `audit_log` with who, what,
  when, and from where.

### C.3 School-to-school transfer flow (worked example)

```
Sending school                      ATLAS                         Receiving school
--------------                      -----                         ----------------
request transfer-out  ───────▶  mint capability token
                                (purpose: records-transfer,
                                 subject: studentId,
                                 audience: receiving tenant,
                                 scope: records:read, TTL 7d)
                                      │
                                 secure link ─────────────────▶  open link (no account)
                                      │                          fetch SIGNED record bundle
                                      │                          (PESC/JSON + signature + QR)
                                 verify signature ◀───────────  verify authenticity
                                      │                          import → transfer-credit eval
                                 acknowledgement ◀───────────  post receipt (idempotent)
                                 event_outbox: student.transferred
```

- The record bundle is a **signed artifact** (as in B.5), so the receiver trusts it without
  trusting the link.
- The receiving school's import is **idempotent** (B.1) — re-opening the link never
  double-imports.
- Both ends get an `event_outbox` event; both ends have an `audit_log` trail. Tenant
  isolation holds throughout — the token reaches exactly one student's bundle in one tenant.

### C.4 Security properties (the non-negotiables)

Least privilege · short expiry · single/limited use · server-side grant (no PII in URL) ·
revocable · fully audited · signed payloads for authenticity · idempotent consumption ·
rate-limited · tenant-isolated. A capability link can only ever do the one thing it was
minted for, to the one subject named, for the one audience intended, until it expires.

---

## Part D — Design rules so future modules stay integrateable

Every new module, from today, follows these so integration is never a retrofit:

1. **API-first.** Ship the versioned contract and read model before (or with) any screen.
2. **Emit events.** Write a domain event to `event_outbox` in the same transaction as any
   state change worth telling the outside world about.
3. **Idempotent writes.** Accept an idempotency key on every external-facing write.
4. **Stable external IDs & documented schemas.** Never make a partner depend on physical
   columns or internal ids that can change.
5. **Capability tokens for every cross-boundary action.** Any time data crosses an
   institution boundary — upload, transfer, verify, share — it goes through a scoped,
   signed, expiring, audited capability link, never a standing credential.
6. **Sign anything that will be trusted elsewhere.** Transcripts, record bundles,
   verification responses are signed artifacts with a public verification path.

---

## Where this lands in the roadmap

- **Phase 1 (pull forward):** class scheduling + conflict checking, capacity/waitlists/
  registration windows (A.1 #1–2) — they make registration real.
- **Phase 2:** the transcript service (B.5) rides on results; results-upload capability
  links (C.1 #1) land with it.
- **Phase 2–3:** transfer credit + inbound/outbound transfer (A.1 #3, C.3); program-stack
  depth (A.1 #6).
- **Cross-cutting, start early:** the capability-token service (Part C), outbox dispatcher +
  signed webhooks (B.3), and partner API credentials (B.2) — small, high-leverage, and
  everything else builds on them.
- **Phase 4–5:** 3C engine, student groups, advising, milestones, attendance, the standards
  adapters (OneRoster/PESC) and SSO.

> This document is the single source of truth for the interoperability stance and the SPIRE
> gap. Update it when a gap is closed or a standard is adopted, and record irreversible
> integration decisions as ADRs under `docs/adr/`.
