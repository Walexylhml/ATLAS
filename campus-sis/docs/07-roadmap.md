# 07 — Roadmap & Phasing

ATLAS is a **full integrated SIS** — that is the product vision and the architecture is built
for it from day one. But "full SIS" is an *architecture* decision, not a *delivery* decision.
We sequence delivery so that each phase is **independently useful, shippable, and
correct** — and so a two-person team can actually get there.

> **Golden rule:** payments and results are correctness-critical. We build the foundation and
> the money rails early, prove correctness, then widen coverage.

---

## Phase 0 — Foundation (the spine everything hangs on)

**Goal:** the platform skeleton that makes every later module possible.

- Multi-tenancy (tenant provisioning, RLS, tenant context).
- Identity / Campus Community: `person`, `user_account`, authentication (OTP/phone-first).
- RBAC: roles, permissions catalogue, scoped assignments, relationship predicates.
- Configuration & rules engine; academic calendar; academic structure (faculty→dept→
  programme); grading scheme.
- Platform admin console (tenant lifecycle, break-glass, audit).
- Cross-cutting: `audit_log`, `event_outbox`, `document` storage, observability, CI/CD.

**Exit criteria:** a tenant can be provisioned and configured; users can log in with correctly
scoped permissions; everything is audited. Nothing student-facing ships yet, but the
foundation is correct.

## Phase 1 — Fees & Registration (the revenue + adoption wedge)

**Goal:** the annual pain point, solved — and the first module that earns.

- Student records: program stack, term activation.
- Curriculum: course catalogue, programme curricula, unit rules, prerequisites.
- Course registration: validation, carryover, add/drop, approval, course form (offline-cached).
- Student financials: fee structures, invoices, **ledger**, payment gateway adapters
  (start with one, e.g. Remita or Paystack), confirmation + reconciliation, holds gating
  registration, receipts.
- Student PWA (mobile-first, offline-tolerant) for registration + fees.
- Notifications (SMS/email/push) for fee deadlines and registration windows.

**Exit criteria:** a student at a pilot institution can pay fees and register for a semester
end-to-end on a phone over weak network; finance can reconcile every naira. **This is the
first sellable, deployable slice.**

## Phase 2 — Results, CGPA & Transcripts (the trust + lock-in module)

**Goal:** the system becomes the academic system of record.

- Assessment config (CA + exam), score entry (lecturer, own courses), bulk/offline entry.
- CGPA engine (exhaustively tested) with carryover/resit rules.
- Results approval chain (exam officer → HOD → dean → senate), lock & publish.
- Grade-change dual-approval; academic standing.
- Transcripts & statements of result (self-service, verifiable).

**Exit criteria:** a full results cycle runs through approval to publication; CGPA and degree
classification are provably correct; students self-serve verifiable transcripts.

## Phase 3 — Admissions (close the front of the funnel)

**Goal:** students enter ATLAS at the very start of their lifecycle.

- JAMB/CAPS intake; Post-UTME & direct-entry applications; checklists/documents.
- Screening/merit; admission decisions; offer accept/decline + acceptance-fee gate.
- Applicant → student conversion (matric issuance, program stack creation).

**Exit criteria:** an institution runs an admission cycle in ATLAS, and admitted candidates
flow straight into registration.

## Phase 4 — Advising, Auxiliary & Regulatory

**Goal:** round out the lifecycle and the back office.

- Degree audit / advising dashboards; graduation eligibility.
- Hostel, ID cards, clearance workflows, SIWES, NYSC mobilisation.
- Regulatory returns (NUC, graduand/matriculation lists).
- Finance depth: split disbursement, waivers/scholarships, refunds, finance reporting.

## Phase 5 — Scale, analytics & network effects

**Goal:** leverage the accumulated data and multi-tenant footprint.

- Leadership dashboards & analytics (retention, at-risk, cohort performance).
- Cross-institution credential-verification network (high-value differentiator).
- Deeper integrations (LMS, SSO), alumni/advancement.
- AI-assisted advising/insights once the data is rich and trusted.

---

## MVP definition (what "first real deployment" means)

**MVP = Phase 0 + Phase 1.** A pilot institution can onboard (configuration only), and its
students can pay fees and register for a semester on a phone over weak network, with finance
able to reconcile completely. That is the smallest thing that is real, sellable, and earns —
while the architecture already carries the full-SIS foundation underneath.

## Sequencing rationale

- **Foundation first** because tenancy, identity, RBAC, and config are load-bearing for
  everything and cannot be retrofitted.
- **Fees + registration before results** because it is the sharpest recurring pain, the
  clearest revenue hook, and plays directly to the founder's fintech strength.
- **Results before admissions** because it creates deep lock-in and is the harder correctness
  problem worth getting right while focus is high.
- **Admissions** then connects the front of the funnel once the core is trusted.
- Each phase is deployable alone, so we earn and learn before the platform is "complete."

## Working cadence (two-person reality)

- Ship thin vertical slices, not whole modules at once.
- Every correctness-critical path (money, CGPA) gets tests before it ships.
- One pilot institution as design partner and lighthouse reference before broadening
  go-to-market (see open questions on beachhead).
- Decisions recorded as ADRs; this repo stays the single source of truth.
