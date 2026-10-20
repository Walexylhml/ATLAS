# 03 — Functional Requirements

Requirements are grouped by module and mapped to the equivalent **PeopleSoft Campus
Solutions** area so the SPIRE lineage is explicit. Each requirement has an ID
(`FR-<MODULE>-<n>`) for traceability. Priority: **M** = MVP/must, **S** = should, **C** =
could/later.

Modules:
1. Tenancy & Configuration
2. Identity / Campus Community
3. Admissions & Recruiting
4. Curriculum Management
5. Student Records & Registration
6. Results, Assessment & CGPA
7. Transcripts & Credentials
8. Student Financials
9. Academic Advisement / Degree Audit
10. Auxiliary Services (Hostel, ID, NYSC, SIWES, Library, Clearance)
11. Communications (3Cs)
12. Platform Administration
13. Reporting & Analytics

---

## 1. Tenancy & Configuration
*(No direct PeopleSoft analogue — this is what makes a single-institution product into a platform.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-TEN-1 | M | Provision a new institution (tenant) with isolated data and its own configuration. |
| FR-TEN-2 | M | Configure institution profile: type (university/poly/COE), faculties, departments, programmes, campuses. |
| FR-TEN-3 | M | Configure the **academic calendar**: sessions, semesters/terms, key dates (registration windows, exam periods, result deadlines). |
| FR-TEN-4 | M | Configure the **grading scheme** (scale, grade bands, grade points, pass marks, degree classifications) per award type. |
| FR-TEN-5 | M | Configure **fee structures** (by programme, level, session, student category) — see Financials. |
| FR-TEN-6 | M | Configure **approval workflows** (results, refunds, role grants) as data. |
| FR-TEN-7 | S | Configure branding (logo, colours, name) for the tenant's portals and documents. |
| FR-TEN-8 | S | Clone configuration from a template or a previous session to speed setup. |
| FR-TEN-9 | M | Version and audit all configuration changes (who/what/when, effective-dated). |

## 2. Identity / Campus Community
*(PeopleSoft: **Campus Community** — the shared person foundation, 3Cs, service indicators.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-ID-1 | M | Maintain a single **person record** per individual within a tenant (the root identity). |
| FR-ID-2 | M | Capture biodata: names, DOB, gender, state of origin/LGA, nationality, contact, next of kin, disability/accessibility needs (NDPA-sensitive). |
| FR-ID-3 | M | Assign and manage institutional identifiers: application number → **matriculation number** (format configurable per tenant). |
| FR-ID-4 | M | Deduplicate identities (prevent two records for the same person). |
| FR-ID-5 | M | **Service indicators / holds** (positive & negative) that gate actions (e.g. unpaid fees block registration). |
| FR-ID-6 | M | Role-based, audited access to PII; field-level sensitivity classification. |
| FR-ID-7 | S | Manage relationships: parent/guardian/sponsor links with scope & consent state. |
| FR-ID-8 | S | Photo capture/management for ID cards and class lists. |

## 3. Admissions & Recruiting
*(PeopleSoft: **Recruiting and Admissions** — leads, applications, decisions; adapted to JAMB/CAPS.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-ADM-1 | M | **Import JAMB/UTME candidates** admitted via CAPS (file upload/API) into the admissions pipeline. |
| FR-ADM-2 | M | Online **application** capture for Post-UTME and **Direct Entry** (A-level, ND, NCE, IJMB). |
| FR-ADM-3 | M | Application **checklist & document upload** (O'level results, JAMB result, birth cert, etc.). |
| FR-ADM-4 | M | Configurable **screening/Post-UTME** scoring and merit ranking. |
| FR-ADM-5 | M | Admission **decision** workflow (offer / reject / waitlist) with departmental quotas. |
| FR-ADM-6 | M | Offer management: candidate **accept/decline**, acceptance-fee payment gate. |
| FR-ADM-7 | M | **Convert admitted applicant → student**, issuing matric number and creating the program stack. |
| FR-ADM-8 | S | Communications at each funnel stage (offer letters, reminders). |
| FR-ADM-9 | C | Prospect/lead capture and recruitment campaigns. |

## 4. Curriculum Management
*(PeopleSoft: **Student Records / Curriculum Management** — catalog, programs, plans.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-CUR-1 | M | Define **academic structure**: faculty → department → programme (plan) → option (sub-plan). |
| FR-CUR-2 | M | Maintain a **course catalogue**: code, title, **credit units**, level, semester, description. |
| FR-CUR-3 | M | Define **programme curricula**: which courses are required/elective per level & semester, minimum/maximum unit loads. |
| FR-CUR-4 | M | Model **prerequisites / co-requisites** and **GST/general-studies** requirements. |
| FR-CUR-5 | M | **Effective-date** curriculum versions so a student is audited against the curriculum of their entry year. |
| FR-CUR-6 | S | Course equivalencies / cross-listing for shared/service courses. |
| FR-CUR-7 | S | Class/section scheduling (timetable, venue, capacity, instructor) where in scope. |

## 5. Student Records & Registration
*(PeopleSoft: **Student Records** — term activation, enrollment, academic standing.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-REC-1 | M | **Program stack**: a student's career/programme/plan with status (active, withdrawn, suspended, graduated) over time. |
| FR-REC-2 | M | **Term/session activation** of eligible students each semester. |
| FR-REC-3 | M | **Course registration** within the registration window, validated against curriculum, unit limits, prerequisites, level, and **holds** (e.g. fees). |
| FR-REC-4 | M | **Carryover handling**: automatically surface outstanding/failed courses for re-registration. |
| FR-REC-5 | M | Registration **approval** workflow (adviser/HOD) where the institution requires it. |
| FR-REC-6 | M | Add/drop within allowed windows; locked after deadline. |
| FR-REC-7 | M | Generate the **course registration form / course form** (downloadable, printable, offline-cached). |
| FR-REC-8 | S | **Academic standing** computation (good standing, probation, withdrawal) per institution rules. |
| FR-REC-9 | S | Leave of absence, deferment, withdrawal, and resumption workflows. |
| FR-REC-10 | M | Class/registration lists available to lecturers and exam officers. |

## 6. Results, Assessment & CGPA
*(PeopleSoft: **Student Records grading / Gradebook**; adapted to CA+Exam, 5.0 scale, senate approval.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-RES-1 | M | **Score entry** per course: configurable **continuous assessment (CA) + examination** components; per-lecturer, for own courses only. |
| FR-RES-2 | M | Compute **grade** and **grade point** from the tenant's grading scheme (e.g. A=70+, 5 points; down to F<40, 0). |
| FR-RES-3 | M | **CGPA engine**: GPA per semester, **CGPA** cumulative, on the configured scale (5.0 for most universities; 4.0 for ND/HND), with **carryover/resit re-computation** rules. |
| FR-RES-4 | M | **Results approval chain** (exam officer → HOD → dean → **senate**), configurable per tenant, with status at each stage. |
| FR-RES-5 | M | **Lock & publish** approved results to students; nothing visible to students before publication. |
| FR-RES-6 | M | **Grade change** after publication only via dual-approval workflow with reason and immutable audit. |
| FR-RES-7 | M | **Degree classification** at graduation (First Class, 2:1, 2:2, Third, Pass) from final CGPA per configured thresholds. |
| FR-RES-8 | S | Missing-score and incomplete-result handling; audit of who entered/edited each score. |
| FR-RES-9 | S | Result statistics (pass rates, distributions) for exam boards. |
| FR-RES-10 | M | Spreadsheet-style **bulk entry/import** of scores for a course (offline-friendly), with validation. |

## 7. Transcripts & Credentials

| ID | Priority | Requirement |
|---|---|---|
| FR-TRN-1 | M | Generate an **official academic transcript** from the student record (per-semester courses, units, grades, GPA/CGPA). |
| FR-TRN-2 | M | Student **self-service transcript request**; configurable fee, delivery (download, to third party). |
| FR-TRN-3 | S | **Verifiable** transcripts/statements of result (QR / verification code against the record). |
| FR-TRN-4 | S | Statement of result, certificate issuance tracking, academic references. |
| FR-TRN-5 | C | Third-party verification portal (employers, schools) — precursor to a verification network. |

## 8. Student Financials
*(PeopleSoft: **Student Financials** — charges, accounts, payments, holds; adapted to NG fee rails.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-FIN-1 | M | Define **fee structures** by programme/level/session/category (acceptance, school fees, departmental dues, sundry). |
| FR-FIN-2 | M | Generate **invoices/charges** per student per session; itemised. |
| FR-FIN-3 | M | A per-student **financial account / ledger** (charges, payments, credits, balance) — double-entry discipline. |
| FR-FIN-4 | M | **Payment integration** with local rails: Remita, Paystack, Flutterwave, Interswitch (pluggable gateway abstraction). |
| FR-FIN-5 | M | Support RRR/pay-at-bank and card/transfer/USSD flows; **payment confirmation via webhook + reconciliation job**; idempotent. |
| FR-FIN-6 | M | **Part-payment / instalment** support where institution allows; configurable minimum to clear registration. |
| FR-FIN-7 | M | **Holds** auto-set/clear based on balance (ties to FR-ID-5, gates registration). |
| FR-FIN-8 | M | **Reconciliation**: match gateway settlements to the ledger; flag mismatches; no silent loss. |
| FR-FIN-9 | S | **Split disbursement** / revenue allocation to faculties/departments/sundry heads. |
| FR-FIN-10 | S | **Waivers, scholarships, sponsorships**; sponsor-paid invoices. |
| FR-FIN-11 | S | **Refunds** via maker-checker workflow. |
| FR-FIN-12 | M | Payment receipts (download, printable, verifiable); full audit of every money event. |
| FR-FIN-13 | S | Finance reporting: collections by session/faculty, outstanding, aging. |

## 9. Academic Advisement / Degree Audit
*(PeopleSoft: **Academic Advisement** — degree audit, what-if.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-AAD-1 | S | **Degree audit**: a student's progress against their programme curriculum (completed, outstanding, in-progress units). |
| FR-AAD-2 | S | Graduation eligibility check (total units, required courses, CGPA threshold). |
| FR-AAD-3 | C | **What-if** analysis (change of programme, projected classification). |
| FR-AAD-4 | S | Adviser dashboard of advisees with progress and at-risk flags. |

## 10. Auxiliary Services

| ID | Priority | Requirement |
|---|---|---|
| FR-AUX-1 | S | **Hostel/accommodation**: inventory (blocks/rooms/bed spaces), application, allocation, check-in/out, fees linkage. |
| FR-AUX-2 | S | **ID card**: matric issuance, photo, card production/printing data, re-issue. |
| FR-AUX-3 | S | **NYSC mobilisation**: final-year eligibility, senate-approved graduand list, mobilisation data export. |
| FR-AUX-4 | S | **SIWES/IT**: placement records, logbooks, supervisor assessment. |
| FR-AUX-5 | S | **Clearance workflows**: multi-unit sign-off (library, bursary, department, hostel) for graduation/exit. |
| FR-AUX-6 | C | **Library** account linkage and clearance status. |
| FR-AUX-7 | C | Health services records (NDPA-sensitive; tight access) if institution opts in. |

## 11. Communications (3Cs)
*(PeopleSoft: **Communications, Checklists, Comments**.)*

| ID | Priority | Requirement |
|---|---|---|
| FR-COM-1 | M | **Notifications** to students/parents/staff via SMS, email, and in-app/push (channel fallback for weak networks). |
| FR-COM-2 | M | Event-driven comms: admission offer, fee deadline, result publication, registration window. |
| FR-COM-3 | S | **Checklists** (outstanding items a student must complete). |
| FR-COM-4 | S | **Comments/case notes** on a student record (advising, conduct), access-controlled. |
| FR-COM-5 | S | Announcement broadcasts scoped to tenant/faculty/department/level. |

## 12. Platform Administration *(our company)*

| ID | Priority | Requirement |
|---|---|---|
| FR-PLT-1 | M | Tenant lifecycle: create, configure, suspend, offboard; per-tenant plan/limits. |
| FR-PLT-2 | M | **Break-glass** tenant access: consent-gated, time-boxed, second-approver, fully audited. |
| FR-PLT-3 | M | Platform permission-catalogue & role-template management (versioned). |
| FR-PLT-4 | M | Billing/subscription & usage metering per tenant. |
| FR-PLT-5 | M | Platform-wide audit log, security monitoring, incident tooling. |
| FR-PLT-6 | S | Tenant health dashboards (adoption, load, errors) on anonymised/aggregate data. |

## 13. Reporting & Analytics

| ID | Priority | Requirement |
|---|---|---|
| FR-RPT-1 | M | Operational reports per module (enrolment, collections, results summaries, registration status). |
| FR-RPT-2 | S | **Regulatory returns** (NUC data, matriculation lists, graduand lists) export. |
| FR-RPT-3 | S | Dashboards for leadership (VC/Registrar/Bursar) — KPIs by faculty/department/session. |
| FR-RPT-4 | C | Analytics: retention, at-risk prediction, cohort performance (later, once data matures). |
| FR-RPT-5 | M | All reports respect RBAC scope; PII exports are approval-gated and logged. |
