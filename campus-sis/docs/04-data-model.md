# 04 — Data Model

This is the **logical data model** for ATLAS: the entities, their keys, relationships, and
the design rules that make the database a trustworthy system of record. It is
technology-agnostic but written with **PostgreSQL** as the assumed engine (see
[`06-architecture.md`](06-architecture.md) for why).

> **Principle:** The database is the contract. Money and academic results are
> *correctness-critical*. The model prioritises integrity, auditability, and temporal
> truth over convenience.

---

## 1. Design principles (apply to every table)

1. **Multi-tenant by `tenant_id`.** Every tenant-owned row carries a non-null `tenant_id`.
   Isolation is enforced at the database layer with **PostgreSQL Row-Level Security (RLS)**
   so no query can cross tenants even on a code bug. Large/sensitive tenants can be promoted
   to **schema-per-tenant or database-per-tenant** without changing the logical model
   (see architecture).
2. **Surrogate primary keys.** Every table has a `id` primary key — a **UUIDv7 / ULID**
   (time-ordered, index-friendly, non-guessable). Natural keys (matric number, course code)
   are modelled as unique constraints, never as the PK.
3. **Effective-dating for things that change over time.** Academic structures, curricula,
   fee structures, grading schemes, and role assignments are **effective-dated**
   (`effective_from`, `effective_to`) — the PeopleSoft `EFFDT` idea. We never silently
   overwrite a rule; we supersede it, so historical records resolve against the rule that
   was in force then. This is what lets a 2031 transcript recompute correctly against the
   2027 curriculum and grading scheme.
4. **No destructive deletes of records of consequence.** Soft-delete / status columns +
   append-only history. Hard deletion is a controlled NDPA "right to erasure" workflow, not
   an everyday operation.
5. **Money is a ledger, never a mutable balance.** Financial truth is an append-only,
   double-entry-style set of entries; balances are derived (and may be cached). Every money
   row is immutable once posted; corrections are new entries.
6. **Everything important is audited.** A global, append-only `audit_log` captures who/what/
   when/before/after for sensitive changes. Domain events go through a transactional
   **outbox** for reliable downstream processing (notifications, reconciliation, analytics).
7. **Referential integrity on.** Foreign keys enforced; cascade rules chosen deliberately
   (mostly `RESTRICT`/`SET NULL`, rarely `CASCADE`).
8. **Explicit enums via reference tables** (not free text) for statuses, grade symbols, etc.,
   so reporting and validation are reliable.
9. **Common columns** on every table: `id`, `tenant_id` (where applicable), `created_at`,
   `created_by`, `updated_at`, `updated_by`, `version` (optimistic locking), and
   `deleted_at` (nullable, soft delete) where soft delete applies.
10. **Monetary type:** store money as integer **minor units** (kobo) + `currency` (ISO 4217,
    default `NGN`). Never floats.

---

## 2. Domain map

```
                         ┌───────────────────┐
                         │      PLATFORM      │
                         │  tenant, plan,     │
                         │  platform_user,    │
                         │  break_glass_grant │
                         └─────────┬──────────┘
                                   │ 1 tenant = 1 institution
      ┌───────────────┬───────────┼───────────────┬──────────────────┐
      ▼               ▼           ▼               ▼                  ▼
 ┌─────────┐   ┌────────────┐ ┌──────────┐  ┌────────────┐   ┌─────────────┐
 │ IDENTITY │   │ ACADEMIC   │ │ADMISSIONS│  │ FINANCIALS │   │ AUXILIARY   │
 │ person   │   │ STRUCTURE  │ │application│  │ fee_ │       │ hostel,     │
 │ user,role│   │ faculty,   │ │ decision │  │ ledger,    │   │ id_card,    │
 │ hold     │   │ dept,prog, │ │ applicant│  │ invoice,   │   │ nysc, siwes │
 │ relation │   │ course,    │ └────┬─────┘  │ payment    │   └─────────────┘
 └────┬─────┘   │ curriculum │      │        └─────┬──────┘
      │         │ grading,   │      ▼              │
      │         │ calendar   │  ┌──────────────┐   │
      │         └─────┬──────┘  │   RECORDS    │   │
      │               │         │ program_stack│   │
      │               ▼         │ term_activ.  │   │
      │         ┌──────────┐    │ enrollment   │◄──┘ (holds gate registration)
      └────────►│ RESULTS  │◄───│ (course reg) │
                │ score,   │    └──────┬───────┘
                │ grade,   │           │
                │ gpa,     │           ▼
                │ approval │     ┌─────────────┐
                └──────────┘     │ TRANSCRIPTS │
                                 └─────────────┘
          cross-cutting: audit_log · event_outbox · communication · document · config
```

---

## 3. Platform domain

### `tenant`
The institution. Root of all tenant-scoped data.
`id, name, short_name, type(university|polytechnic|college_of_education), country, state,
status(active|suspended|onboarding|offboarded), plan_id, data_region, branding(jsonb),
created_at, …`

### `plan`
Subscription plan / limits. `id, name, limits(jsonb), price_*`

### `platform_user`
Our company's staff. `id, name, email, status, mfa_enabled, …` (NOT tenant-scoped).

### `platform_role_assignment`
`id, platform_user_id, role(super_admin|ops|support|billing|compliance|onboarding),
effective_from, effective_to`

### `break_glass_grant`
Audited, time-boxed platform access into a tenant.
`id, tenant_id, platform_user_id, reason, approved_by, consent_ref, granted_at, expires_at,
revoked_at, scope(jsonb)` — every use writes to `audit_log`.

---

## 4. Identity domain (Campus Community)

### `person`
The single identity root within a tenant. Everyone (applicant, student, staff, parent) is a
`person` first.
`id, tenant_id, title, surname, first_name, other_names, dob, gender, nationality,
state_of_origin, lga, marital_status, religion?, disability_needs?, photo_doc_id,
primary_email, primary_phone, status, created_at, …`
*PII-sensitive fields are classified for field-level access & encryption.*

### `person_contact` / `person_address` / `next_of_kin`
Normalised contact, address history, NOK. `person_id, type, value, is_primary, effective_*`

### `user_account`
Login identity bound to a `person` (not everyone has one; some persons are records only).
`id, tenant_id, person_id, username, email, phone, auth_method, mfa_enabled, status,
last_login_at, …`

### `role` (template + custom)
`id, tenant_id(nullable → null = platform template), key, name, description,
is_system, version`

### `permission` (catalogue, platform-defined, versioned)
`id, key(e.g. results.approve.department), resource, action, requires_step_up(bool),
relationship_predicate(nullable), catalogue_version`

### `role_permission`
`role_id, permission_id` (many-to-many).

### `role_assignment`  ← the heart of RBAC
`id, tenant_id, user_account_id, role_id, scope_type(tenant|faculty|department|programme|self),
scope_ref_id(nullable), effective_from, effective_to, granted_by, status`
*Effective-dated so historical authority is reconstructable.*

### `relationship`  ← parent/guardian/sponsor links
`id, tenant_id, from_person_id(parent/sponsor), to_person_id(student),
type(parent|guardian|sponsor), financial_scope(bool), academic_scope(bool),
consent_state(pending|granted|revoked), consent_evidence_ref, effective_*`
*Drives `is_my_child` predicate and NDPA-consented parent visibility.*

### `service_indicator` (holds)
Positive/negative indicators that gate or enable actions.
`id, tenant_id, person_id, type, polarity(positive|negative), reason, impact(jsonb — e.g.
blocks: [registration, results, transcript]), placed_by, placed_at, released_by, released_at,
status`

---

## 5. Academic structure domain (effective-dated)

### `academic_career`
Top level (Undergraduate, Postgraduate, ND, HND, NCE). `id, tenant_id, key, name, award_type`

### `faculty` → `department` → `programme` → `programme_option`
```
faculty(id, tenant_id, name, code, effective_*)
department(id, tenant_id, faculty_id, name, code, effective_*)
programme(id, tenant_id, department_id, career_id, name, code, award(BSc/BEng/ND/NCE…),
          duration_years, min_graduation_units, effective_*)
programme_option(id, tenant_id, programme_id, name, code, effective_*)   -- specialisation
```

### `academic_session` → `academic_term`
```
academic_session(id, tenant_id, name('2027/2028'), start_date, end_date, status)
academic_term(id, tenant_id, session_id, name('First Semester'|'Second Semester'|…),
              seq, start_date, end_date, registration_open, registration_close,
              exam_start, exam_end, status)
```

### `grading_scheme` + `grade_band` (effective-dated)
```
grading_scheme(id, tenant_id, name, scale_max(5.00|4.00), applies_to_career_id, effective_*)
grade_band(id, grading_scheme_id, symbol('A'..'F'), min_score, max_score, grade_point,
           is_pass)
degree_class(id, grading_scheme_id, name('First Class'…), min_cgpa, max_cgpa)
```
*Example (5.0 scheme): A 70–100 → 5.0 (pass); B 60–69 → 4.0; C 50–59 → 3.0; D 45–49 → 2.0;
E 40–44 → 1.0; F 0–39 → 0.0. Degree classes: First 4.50–5.00, 2:1 3.50–4.49, 2:2 2.40–3.49,
Third 1.50–2.39, Pass 1.00–1.49. Stored as data, never hard-coded.*

### `course` (catalogue) + `course_requisite`
```
course(id, tenant_id, code('CSC101'), title, credit_units, career_id, default_level,
       default_semester_seq, description, status, effective_*)
course_requisite(id, course_id, requisite_course_id, type(prereq|coreq|antireq))
```

### `curriculum` + `curriculum_course` (effective-dated per entry-year)
```
curriculum(id, tenant_id, programme_id, option_id?, entry_session_id, name, status,
           effective_*)
curriculum_course(id, curriculum_id, course_id, level(100..), semester_seq,
                  requirement(core|required_elective|elective|gst),
                  units_override?, group_tag?)   -- what a cohort must take & when
```

### `course_offering` (a course mounted in a term) + `class_section`
```
course_offering(id, tenant_id, course_id, term_id, department_id, capacity, status)
class_section(id, offering_id, code, instructor_user_id, venue, schedule(jsonb), capacity)
```

---

## 6. Admissions domain

### `applicant` (a person in the admissions context)
`id, tenant_id, person_id, intake_session_id, entry_mode(utme|direct_entry|transfer),
jamb_reg_no?, jamb_score?, status`

### `application`
`id, tenant_id, applicant_id, programme_choice_1, programme_choice_2?, status(draft|submitted|
screening|offered|accepted|declined|rejected|waitlisted), submitted_at, decision_at`

### `application_document` (checklist items)
`id, application_id, type(olevel|jamb_result|birth_cert|…), document_id, verified(bool),
verified_by`

### `screening_score` (Post-UTME / aggregate)
`id, application_id, component, score, max, weight`

### `admission_decision`
`id, application_id, programme_id, decision(offer|reject|waitlist), quota_ref, decided_by,
decided_at, offer_expires_at, acceptance_payment_ref?`
*On `accepted` + acceptance fee paid → triggers conversion to student (program stack).*

---

## 7. Student records domain

### `student`  (the person as an enrolled student)
`id, tenant_id, person_id, matric_number(unique per tenant), entry_session_id, entry_level,
current_level, status(active|suspended|withdrawn|graduated|deferred), …`

### `program_stack`  (student's programme enrolment over time)
`id, tenant_id, student_id, programme_id, option_id?, curriculum_id, career_id,
status(active|discontinued|changed|completed), start_session_id, end_session_id?,
effective_*`
*A student can change programme; each is a stacked row, so history is intact.*

### `term_activation`  (eligible & active for a term)
`id, tenant_id, student_id, term_id, level, status, activated_at`

### `enrollment`  (course registration — one row per course per term)
`id, tenant_id, student_id, term_id, course_id, offering_id?, units, level,
registration_type(normal|carryover|elective|audit),
status(registered|added|dropped|approved|void), registered_at, approved_by?, approved_at?`
*Unique (student_id, term_id, course_id). Validated against curriculum, unit caps,
requisites, and holds at write time.*

### `registration_form` (snapshot/document of a term's registration)
`id, tenant_id, student_id, term_id, snapshot(jsonb), document_id, generated_at`

### `academic_standing`
`id, tenant_id, student_id, term_id, gpa, cgpa, standing(good|probation|withdrawal),
computed_at`

---

## 8. Results domain

### `assessment_component` (per offering/course config)
`id, tenant_id, course_id|offering_id, name(CA|Exam|Practical), max_score, weight`

### `score`  (raw marks — entered by lecturer, for own courses)
`id, tenant_id, enrollment_id, offering_id, component_id, raw_score, entered_by, entered_at,
source(manual|import), status(draft|submitted)`
*Append-only edit trail via `score_history`.*

### `result`  (computed per enrollment, pending→approved→published)
`id, tenant_id, enrollment_id, student_id, course_id, term_id, total_score, grade_symbol,
grade_point, quality_points(gp×units), status(computed|submitted|approved|published|
withheld|changed), grading_scheme_id`

### `result_approval` (workflow instance)
`id, tenant_id, result_batch_id, stage(exam_officer|hod|dean|senate), actor_user_id,
action(approve|return|reject), comment, acted_at`
*`result_batch` groups a course/department/session submission through the chain.*

### `grade_change` (post-publication, dual-approval)
`id, tenant_id, result_id, old_grade, new_grade, reason, requested_by, approved_by_1,
approved_by_2, status, audit_ref`

### `gpa_summary` (derived, cached, recomputable)
`id, tenant_id, student_id, term_id, semester_units, semester_qp, gpa, cumulative_units,
cumulative_qp, cgpa, computed_at`
*Always derivable from `result`; cached for performance. Carryover re-sits update prior
contribution per institution rule.*

---

## 9. Financials domain (ledger discipline)

### `fee_structure` + `fee_item` (effective-dated)
```
fee_structure(id, tenant_id, name, applies_to(programme/level/session/category jsonb),
              session_id, status, effective_*)
fee_item(id, fee_structure_id, name(acceptance|school_fee|dept_dues|…), amount_minor,
         currency, mandatory(bool), min_to_clear_minor?, revenue_head_id?)
```

### `student_account` (one ledger per student)
`id, tenant_id, student_id, currency, status`
*Balance is DERIVED from `ledger_entry`, not stored as source of truth.*

### `invoice` + `invoice_line`
```
invoice(id, tenant_id, student_account_id, session_id, status(open|part_paid|paid|void),
        total_minor, currency, due_date, created_at)
invoice_line(id, invoice_id, fee_item_id, description, amount_minor)
```

### `ledger_entry`  (append-only, immutable)
`id, tenant_id, student_account_id, entry_type(charge|payment|credit|refund|reversal|waiver),
amount_minor(signed), currency, ref_type, ref_id, posted_at, posted_by, idempotency_key,
reversal_of_id?`
*Immutable once posted. Corrections are new reversing entries. `idempotency_key` prevents
double-posting from retried webhooks.*

### `payment` (gateway transaction)
`id, tenant_id, student_account_id, invoice_id?, provider(remita|paystack|flutterwave|
interswitch), provider_ref(RRR/txn), amount_minor, currency, channel(card|transfer|ussd|bank),
status(initiated|pending|success|failed|abandoned), initiated_at, confirmed_at,
raw_payload(jsonb), idempotency_key`
*Confirmation via webhook AND reconciliation poll; both idempotent; posts one `ledger_entry`.*

### `reconciliation_run` / `reconciliation_exception`
`run(id, tenant_id, provider, period, matched, unmatched, started_at, finished_at)`
`exception(id, run_id, payment_id?, provider_ref, reason, amount_minor, status(open|resolved))`
*No payment is ever silently lost; mismatches surface as exceptions for finance.*

### `disbursement_rule` / `disbursement` (split to faculties/heads)
`rule(id, tenant_id, fee_item_id|revenue_head_id, allocations(jsonb %/fixed))`
`disbursement(id, tenant_id, period, allocations(jsonb), status)`

### `waiver` / `scholarship` / `sponsor`
`id, tenant_id, student_id, type, amount_minor|percent, sponsor_person_id?, approved_by,
status, effective_*`

---

## 10. Auxiliary domain

```
hostel(id, tenant_id, name, gender, campus)              room(id, hostel_id, number, capacity)
bed_space(id, room_id, label, status)
hostel_allocation(id, tenant_id, student_id, bed_space_id, session_id, status,
                  checked_in_at, checked_out_at, fee_ref)

id_card(id, tenant_id, person_id, card_no, issued_at, expires_at, status, photo_doc_id)

nysc_mobilisation(id, tenant_id, student_id, session_id, eligible(bool), senate_approved(bool),
                  final_cgpa, degree_class, mobilised(bool), batch, export_ref)

siwes_placement(id, tenant_id, student_id, company, start, end, supervisor, logbook_doc_id,
                score, status)

clearance(id, tenant_id, student_id, type(graduation|exit), status)
clearance_step(id, clearance_id, unit(library|bursary|department|hostel), status, actioned_by)
```

---

## 11. Cross-cutting

### `document` (uploads / generated files)
`id, tenant_id, owner_person_id?, type, filename, storage_ref, content_type, size,
checksum, sensitivity, uploaded_by, created_at`
*Binary in object storage; this row is the metadata + access control.*

### `communication` (3Cs + delivery)
`id, tenant_id, person_id, channel(sms|email|push|inapp), template_key, payload(jsonb),
status(queued|sent|delivered|failed), event_ref, created_at, delivered_at`

### `checklist` / `checklist_item`
`id, tenant_id, person_id, context, item, status(outstanding|complete), due_date`

### `comment` (case notes on a record, access-controlled)
`id, tenant_id, subject_person_id, author_user_id, category, body, visibility, created_at`

### `audit_log`  (append-only, global)
`id, tenant_id?, actor_type(platform|user|system), actor_id, action, resource_type,
resource_id, before(jsonb), after(jsonb), ip, user_agent, assurance_level, at,
break_glass_ref?`
*Immutable; the record of who did what. Sensitive actions (results, money, PII export,
break-glass) always land here.*

### `event_outbox`  (transactional outbox)
`id, tenant_id, aggregate_type, aggregate_id, event_type, payload(jsonb), status(pending|
dispatched|failed), occurred_at, dispatched_at`
*Written in the same transaction as the state change; a dispatcher relays to notifications,
reconciliation, analytics. Guarantees no lost side effects even on crash.*

### `config` / `config_history`
`id, tenant_id, namespace, key, value(jsonb), effective_*, version` — all tenant configuration,
versioned and effective-dated.

---

## 12. Integrity & correctness rules (enforced, not hoped for)

- **Unique:** `student.matric_number` per tenant; `enrollment(student,term,course)`;
  `payment.idempotency_key`; `ledger_entry.idempotency_key`.
- **Check constraints:** `amount_minor` currency valid; `grade_band` ranges non-overlapping;
  `credit_units > 0`; `effective_to > effective_from` or null.
- **RLS:** every tenant-owned table filters by `tenant_id = current_setting('app.tenant')`.
- **No float money.** Enforced by integer-minor-unit columns.
- **Results never visible pre-publication.** `result.status = published` gate at the query
  layer + RLS/policy; students cannot read `computed|approved` rows.
- **Ledger immutability.** DB trigger/permissions forbid `UPDATE`/`DELETE` on posted
  `ledger_entry`; reversal only.
- **Idempotent money.** Webhook + reconciliation both key on `idempotency_key`; a replayed
  webhook posts nothing new.
- **Optimistic concurrency** via `version` on mutable rows to prevent lost updates (e.g. two
  officers editing config).

## 13. Performance & scale

- **Indexing:** composite indexes leading with `tenant_id`; hot paths — enrollment by
  (tenant, term, student), result by (tenant, term, student), ledger by (tenant, account).
- **Partitioning:** large append-only tables (`audit_log`, `ledger_entry`, `communication`,
  `score`) partitioned by `tenant_id` and/or time.
- **Derived caches:** `gpa_summary`, account balances — recomputable from source; never the
  source of truth.
- **Read replicas** for reporting/analytics; heavy exports hit replicas, not primary.
- **Archival:** closed sessions can be moved to colder storage while remaining queryable for
  transcripts.

## 14. Data protection (NDPA) hooks in the model

- **Sensitivity classification** on PII columns/`document.sensitivity` drives encryption and
  access.
- **Consent** represented in `relationship.consent_state` and a general consent record where
  needed.
- **Right to erasure / portability**: controlled workflows operate on `person` and linked
  rows with audit; erasure anonymises rather than breaking referential integrity of
  academic/financial records required by law/retention.
- **Audit everything sensitive** via `audit_log`.

See [`05-nonfunctional-requirements.md`](05-nonfunctional-requirements.md) for the full
security & compliance posture.
