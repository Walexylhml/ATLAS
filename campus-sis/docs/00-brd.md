# Business Requirements Document (BRD)

**Product:** ATLAS — Academic Tracking, Learning, and Achievement System (a multi-tenant Student Information System for African higher education)
**Document owner:** Whale (Adebayo Olawale)
**Status:** Draft v0.1 — for review
**Last updated:** 2026-10-20

---

## 1. Executive summary

Nigerian higher-education institutions operate without a shared, integrated student
information system. Each institution builds or buys a bespoke portal that typically covers
only course registration and fee payment, leaving admissions, results processing,
transcripts, academic advising, hostels, and compliance (NYSC, NUC returns) fragmented
across disconnected systems and manual workflows.

This project will deliver a **cloud-native, multi-tenant SIS** that gives each institution
a single integrated platform covering the full student lifecycle — from JAMB/CAPS admission
intake through enrolment, results, graduation, and NYSC mobilisation — modelled on the
integration philosophy of **Oracle PeopleSoft Campus Solutions** (the engine behind UMass
Amherst's **SPIRE**) but rebuilt for the Nigerian context: cheap Android phones, weak and
intermittent networks, local payment rails, local admission and grading rules, and the
Nigeria Data Protection Act (NDPA) 2023.

The platform is **configuration-driven**: a single codebase serves universities,
polytechnics, and colleges of education, with each institution (tenant) configuring its own
academic structure, grading scale, fee schedule, and approval workflows as data — not custom
code. This is the defining architectural decision that makes "serve everyone" economically
viable.

## 2. Problem statement

**For institutions:** No affordable, integrated, maintainable SIS exists. In-house portals
are brittle, under-resourced, and rarely integrated end-to-end. Results processing and
transcript issuance are slow and error-prone. Fee reconciliation is painful. There is no
single source of truth for a student's record.

**For students and parents:** Experiences are fragmented and unreliable — multiple logins,
portals that fail under registration-period load, opaque fee payment and reconciliation,
slow transcripts, and poor mobile experiences on the devices and networks they actually use.

**For the regulator and ecosystem:** NUC returns, NYSC mobilisation, and verification of
credentials are manual and inconsistent across institutions.

**Root cause:** The market treats each institution as a one-off build. Nobody has built a
configurable, multi-tenant platform that absorbs institutional variance as configuration.

## 3. Goals and objectives

### Business goals
- **G1.** Establish the first credible integrated multi-tenant SIS for African higher education.
- **G2.** Generate recurring SaaS revenue, with payments/fee-processing as an early monetisation wedge.
- **G3.** Become the system of record institutions trust for money, results, and transcripts.

### Product objectives
- **O1.** One integrated student record spanning admissions → records → results → financials → graduation.
- **O2.** Institution self-service configuration so onboarding a new school is setup, not re-engineering.
- **O3.** A mobile-first experience that works on low-end Android over intermittent 3G.
- **O4.** Correctness guarantees for the two things that must never be wrong: **money and results**.
- **O5.** NDPA-compliant handling of student personal data with full auditability.

## 4. Success metrics (how we'll know it's working)

| Metric | Target (indicative) |
|---|---|
| Time to onboard a new institution (config only) | < 4 weeks |
| Course-registration success rate during peak load | > 99% of attempts complete |
| Fee payment → reconciliation latency | Real-time to < 5 min |
| Results → approved → published turnaround | Days, not weeks |
| Transcript issuance (verified) | Minutes, self-service |
| p95 page interactive time on 3G / low-end Android | < 5 s |
| Core data correctness (money, GPA) defects in production | Zero tolerance; tracked |
| Uptime (academic peak periods) | ≥ 99.9% |

## 5. Stakeholders

| Stakeholder | Interest |
|---|---|
| **Platform company (us)** | Build, operate, support, bill; own the roadmap and data-protection posture |
| **Institution leadership** (VC, Registrar, Bursar) | Reliability, compliance, cost, control, reporting |
| **Institution ICT/registry** | Admin, configuration, day-to-day operations |
| **Academic staff** (Deans, HODs, lecturers, exam officers, advisors) | Teaching, grading, approvals, advising |
| **Students** | Admission, registration, fees, results, transcripts, services |
| **Parents / sponsors** | Visibility into fees and progress; payment |
| **Regulators** (NUC, NYSC, JAMB) | Standards, returns, mobilisation, admission integrity |
| **Payment providers** (Remita, Paystack, Flutterwave, Interswitch) | Integration partners |

Detailed personas and the complete role/permission model are in
[`02-personas-and-rbac.md`](02-personas-and-rbac.md).

## 6. Scope

### In scope (platform vision — sequenced, not all at once)
Full integrated SIS covering: tenancy & configuration; identity/Campus Community; admissions
(JAMB/CAPS, Post-UTME, direct entry); curriculum management; student records & course
registration; results, CGPA engine & senate approval; transcripts; student financials & fee
rails; academic advising/degree audit; auxiliary services (hostel, ID cards, NYSC, SIWES);
communications; platform administration; reporting & analytics. See
[`03-functional-requirements.md`](03-functional-requirements.md).

### Out of scope (for now)
- Full Learning Management System (LMS) — integrate with Moodle/Canvas rather than rebuild.
- Payroll / core HR / ERP finance beyond student financials.
- Research grants management, library ILS internals (integrate, don't rebuild).
- Primary/secondary (K-12) education.

### Explicitly deferred (later phases)
- Alumni/contributor relations, advancement.
- Cross-institution credential verification network (high-value, later).
- AI-assisted advising and analytics (natural extension once data exists).

## 7. Assumptions

- Target users carry low-to-mid-range Android devices on metered, intermittent mobile data.
- Institutions have weak or intermittent campus connectivity and limited ICT capacity.
- JAMB/CAPS remains the national admissions gateway; integration may be file-based initially.
- Local payment aggregators (Remita, Paystack, Flutterwave, Interswitch) remain the fee rails.
- Data residency within Nigeria is likely required or strongly preferred for public institutions.
- Initial build is a two-person effort (founder + Claude); architecture must favour a small team.

## 8. Constraints

- **Team size:** Solo founder + AI co-builder initially. Favour a modular monolith and
  managed infrastructure over microservices and self-managed ops.
- **Budget:** Bootstrapped; infrastructure and third-party costs must scale with revenue.
- **Regulatory:** NDPA 2023 compliance is mandatory, not optional.
- **Network reality:** The product is judged on the worst network, not the best.
- **Trust:** As a system of record for money and results, correctness and auditability
  outrank feature velocity.

## 9. High-level requirements (traceability anchors)

| ID | Requirement | Detail |
|---|---|---|
| HLR-1 | Multi-tenant isolation with per-tenant configuration | [06](06-architecture.md), [04](04-data-model.md) |
| HLR-2 | Single integrated student identity and record | [03](03-functional-requirements.md), [04](04-data-model.md) |
| HLR-3 | Complete role/permission model across all user classes | [02](02-personas-and-rbac.md) |
| HLR-4 | Full student-lifecycle functional coverage | [03](03-functional-requirements.md) |
| HLR-5 | Robust, correct, auditable data model (money & results) | [04](04-data-model.md) |
| HLR-6 | Low-bandwidth, mobile-first, offline-tolerant UX | [05](05-nonfunctional-requirements.md) |
| HLR-7 | NDPA-compliant data protection and auditability | [05](05-nonfunctional-requirements.md) |
| HLR-8 | Local payment-rail integration with reconciliation | [03](03-functional-requirements.md) |
| HLR-9 | Phased, independently-deployable module delivery | [07](07-roadmap.md) |

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Scope overwhelm ("full SIS for everyone at once") | Project never ships | Sequence delivery; each module usable alone (see roadmap) |
| Two-person build velocity | Slow time-to-first-customer | Modular monolith, managed infra, config-driven onboarding |
| Institutional procurement/politics (public unis) | Long sales cycles | Land easier segments first; build lighthouse references |
| Data-protection breach of student PII | Legal + reputational ruin | NDPA-by-design, encryption, audit, least privilege |
| Peak-load failure during registration | Credibility loss | Load design, queueing, graceful degradation (see NFRs) |
| Payment reconciliation errors | Direct financial/trust damage | Idempotency, ledger model, reconciliation jobs (see data model) |

## 11. References

- Oracle PeopleSoft Campus Solutions — module overview and architecture (see sources in glossary).
- NUC grading framework (5.0 CGPA scale, degree classifications).
- JAMB CAPS admissions process.
- Nigeria Data Protection Act (NDPA) 2023.
