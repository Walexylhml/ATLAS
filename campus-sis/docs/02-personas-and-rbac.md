# 02 — Personas & Role-Based Access Control (RBAC)

This is the authoritative definition of **who uses ATLAS** and **what they can do**. It
covers three levels of actor: the **platform** (our company), the **institution** (the
tenant), and the **individuals** inside and around each institution (staff, students,
parents).

---

## 1. The three authority levels

```
┌─────────────────────────────────────────────────────────────────┐
│  PLATFORM LEVEL  (our company — ATLAS)                            │
│  Operates the platform across ALL tenants. Never touches academic │
│  decisions. Manages tenants, billing, platform support, security. │
└───────────────┬─────────────────────────────────────────────────┘
                │ provisions & supports (cross-tenant, least-privilege)
┌───────────────▼─────────────────────────────────────────────────┐
│  INSTITUTION LEVEL  (one tenant = one institution)               │
│  Self-governs its own data, config, policies, users and workflows.│
│  Platform cannot see tenant academic data except via audited,     │
│  consented support access.                                         │
└───────────────┬─────────────────────────────────────────────────┘
                │ contains
┌───────────────▼─────────────────────────────────────────────────┐
│  INDIVIDUAL LEVEL  (within a tenant)                              │
│  Staff · Students · Parents/Sponsors — scoped to their role and   │
│  their slice of the institution (faculty / department / self).    │
└───────────────────────────────────────────────────────────────── ┘
```

**Hard rule — tenant isolation:** No individual-level user can ever see data belonging to
another tenant. Platform-level users can only reach tenant academic/personal data through an
explicit, time-boxed, audited, consent-gated "support access" mechanism — never silently.

---

## 2. Platform-level personas (our company)

These accounts belong to us, the operator. They are cross-tenant but deliberately narrow.

| Persona | What they do | What they must NOT do |
|---|---|---|
| **Power Admin / Super Admin** | The root of the platform. Create/suspend tenants, define platform-wide roles, manage platform configuration, break-glass access, manage other platform staff. | Routinely read tenant student PII or alter academic records. Any such access is break-glass, logged, and consent-gated. |
| **Platform Operations / SRE** | Deploy, monitor, scale, run jobs, manage infrastructure, incident response. | Read tenant business data except anonymised/aggregate telemetry. |
| **Platform Support (Tier 1/2)** | Help tenants with config and usage. Enter a tenant only via time-boxed, tenant-approved "support mode", with every action attributed and logged. | Persistent or silent access to a tenant. Write academic/financial records without tenant authorisation. |
| **Platform Billing / Revenue** | Manage subscriptions, invoicing to institutions, usage metering, plan limits. | Access student-level academic records. |
| **Platform Compliance / DPO** | Data-protection oversight, audit review, data-subject request handling across tenants (with tenant), security policy. | Make academic decisions. |
| **Platform Onboarding Specialist** | Stand up a new tenant: initial configuration, data migration, training. Elevated during onboarding window, then stepped down. | Retain elevated access after go-live. |

**Design note on "Power Admin":** separate the *ability to administer the platform* from the
*ability to read tenant data*. The Power Admin can run the business without being able to
browse any student's record. Reading tenant PII is a distinct, break-glass capability with
its own approval, expiry, and audit — even for the Super Admin. This is what keeps us
NDPA-defensible and trustworthy to institutions.

---

## 3. Institution-level personas (one tenant)

### 3.1 Institution administration & registry

| Persona | Scope | Core responsibilities |
|---|---|---|
| **Institution Admin (Tenant Owner)** | Whole tenant | The school's root user (typically ICT director / registry super-user). Manages institution config, users, roles, academic calendar, integrations. Delegates to others. |
| **Registrar** | Whole tenant (academic records) | Owns the student record and academic policy execution: matriculation, registration rules, results publication oversight, transcripts, graduation, NUC/regulatory returns. |
| **Deputy / Assistant Registrar (Faculty/Exams/Admissions)** | Faculty or function | Scoped registry officers running a faculty's records, the exams office, or admissions. |
| **ICT / System Administrator** | Whole tenant (technical) | User provisioning, integrations, SSO, data imports, troubleshooting. Technical, not academic authority. |

### 3.2 Finance

| Persona | Scope | Core responsibilities |
|---|---|---|
| **Bursar / Director of Finance** | Whole tenant (finance) | Owns fee structures, charges, payment configuration, reconciliation, financial reporting, waivers/scholarships policy. |
| **Finance Officer / Cashier** | Whole tenant or faculty | Day-to-day payment confirmation, reconciliation, refunds processing, invoice queries. |
| **Scholarship / Bursary Officer** | Whole tenant | Manages waivers, scholarships, sponsor arrangements. |

### 3.3 Academic hierarchy

| Persona | Scope | Core responsibilities |
|---|---|---|
| **Dean of Faculty** | Faculty | Oversight of departments in the faculty; approvals in the results/senate chain; faculty-level reporting. |
| **Head of Department (HOD)** | Department | Programme/course ownership, lecturer assignment, department-level result approval, advising oversight. |
| **Exam Officer** | Department/Faculty | Collates and validates results, manages the assessment pipeline up to approval. (Segregated from the lecturer who enters marks.) |
| **Lecturer / Instructor** | Assigned courses | Course content/outline, continuous assessment and exam score entry, class lists, attendance. |
| **Academic Adviser / Level Adviser** | Assigned students | Advises advisees, reviews registration and degree progress, flags at-risk students. |
| **Course Coordinator** | A course across sections | Coordinates multi-section/large courses (e.g. GST), consolidates scores. |

### 3.4 Student services & auxiliary

| Persona | Scope | Core responsibilities |
|---|---|---|
| **Student Affairs / Dean of Students** | Whole tenant | Welfare, conduct, student services oversight. |
| **Hostel / Accommodation Officer** | Whole tenant | Hostel inventory, allocation, check-in/out. |
| **Health Services Officer** | Whole tenant | Campus clinic records (if in scope; NDPA-sensitive — tight access). |
| **Library Officer** | Whole tenant | Library account linkage, clearance. |
| **ID Card / Records Officer** | Whole tenant | Matric number issuance, ID card production, verifications. |
| **NYSC / Mobilisation Officer** | Whole tenant | Final-year eligibility, senate list, NYSC mobilisation data. |
| **SIWES / Industrial Training Coordinator** | Faculty/Dept | Placement, logbooks, assessment of industrial training. |

### 3.5 The student and the people around them

| Persona | Scope | Core responsibilities / capabilities |
|---|---|---|
| **Applicant / Prospective student** | Self (pre-admission) | Create application, upload documents, pay application/acceptance fees, track admission status, accept/decline offer. |
| **Student** | Self | Register courses, view/pay fees, view results & CGPA, request transcripts, apply for hostel, access ID/clearance, receive communications, manage profile. |
| **Parent / Guardian / Sponsor** | Linked student(s), consented, scoped | View fee status and pay fees; view progress/results **only to the extent the student (if adult) and institution policy permit**; receive notifications. |
| **Alumnus** (later phase) | Self (post-graduation) | Request/verify transcripts and credentials; alumni services. |

**Parent access — important nuance:** A parent/sponsor relationship is explicit and
consent-aware. Financial visibility (fees owed, pay on behalf) is generally allowed because
sponsors pay. Academic visibility (results) is **policy- and consent-gated**: configurable
per institution, and for adult students subject to the student's consent, to stay
NDPA-aligned. The data model must represent the relationship, its scope, and its consent
state explicitly (see [`04-data-model.md`](04-data-model.md)).

---

## 4. The RBAC model

ATLAS uses **role-based access control with scoping**, plus a thin layer of
**attribute/relationship checks** for self-service and parent-student links.

### 4.1 Core concepts

- **User** — one authenticated identity. A user may hold multiple roles (a lecturer who is
  also an HOD) and may, rarely, belong to more than one tenant (handled as distinct
  memberships, never shared data).
- **Role** — a named bundle of **permissions** (e.g. `lecturer`, `hod`, `bursar`). Roles are
  **system-defined templates** that tenants can clone and customise. Tenants can create
  custom roles from the permission catalogue.
- **Permission** — an atomic capability on a resource + action, e.g.
  `results.score.enter`, `results.approve.department`, `finance.payment.confirm`,
  `student.record.read`. The permission catalogue is platform-defined and versioned.
- **Scope** — the slice of the tenant a role assignment applies to:
  `tenant` → `faculty` → `department` → `programme` → `self`. A role is always granted
  *at a scope*. "Dean, Faculty of Science" = role `dean` at scope `faculty:science`.
- **Role assignment** — (user, role, scope, validity period). Effective-dated so that
  historical "who could do what, when" is reconstructable.
- **Relationship predicate** — dynamic checks beyond static roles: `is_self`,
  `is_my_advisee`, `is_my_course`, `is_my_child` (parent link), `is_my_faculty`. These power
  self-service without exploding the role catalogue.

### 4.2 Evaluation rule

An action is **allowed** iff:
1. the user holds a role granting the required permission, **and**
2. the target resource falls within that assignment's **scope**, **and**
3. any **relationship predicate** on the permission is satisfied, **and**
4. the assignment is **currently valid** (within its effective dates and not suspended),
   **and**
5. the user's session meets the **assurance level** the permission requires (e.g. sensitive
   finance/results actions may require re-authentication / step-up).

Default posture is **deny**. Everything not explicitly granted is refused.

### 4.3 Segregation of duties (SoD)

Certain capabilities must not sit with one person. The system flags/forbids conflicting
grants:

- **Enter results** (`lecturer`) vs **approve results** (`exam_officer`/`hod`/`dean`/senate).
- **Configure fees** (`bursar`) vs **confirm/refund payments** (`cashier`) — maker/checker.
- **Create user & assign role** (`ict_admin`) vs **approve privileged role grant**
  (`institution_admin`) for sensitive roles.
- **Break-glass tenant access** (platform) always requires a second approver.

### 4.4 Sensitive actions require step-up & second approval

| Action | Control |
|---|---|
| Publish results | Senate/registrar approval chain + audit |
| Change a published grade | Dual approval + reason + immutable audit entry |
| Process refund / reverse payment | Maker-checker + threshold-based approval |
| Bulk data export of PII | DPO/registrar approval + logged + watermarked |
| Platform break-glass into tenant | Tenant consent (or documented emergency) + second platform approver + auto-expiry + full audit |
| Delete / anonymise personal data | DPO workflow (NDPA data-subject rights) |

### 4.5 Example permission matrix (illustrative, not exhaustive)

Legend: ✅ full · 🔶 scoped (own faculty/dept/students) · 👁 read-only · ⬚ none

| Capability | Super Admin* | Inst. Admin | Registrar | Bursar | Dean | HOD | Exam Officer | Lecturer | Adviser | Student | Parent |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Manage tenant config | ✅(platform) | ✅ | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Manage users & roles | ✅(platform) | ✅ | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Admissions decisions | ⬚ | 👁 | ✅ | ⬚ | 🔶 | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Define curriculum/courses | ⬚ | 🔶 | ✅ | ⬚ | 🔶 | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Approve course registration | ⬚ | 🔶 | ✅ | ⬚ | 🔶 | 🔶 | ⬚ | ⬚ | 🔶 | ⬚ | ⬚ |
| Register for courses | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | 🔶(self) | ⬚ |
| Enter CA/exam scores | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | 🔶(own courses) | ⬚ | ⬚ | ⬚ |
| Collate/validate results | ⬚ | ⬚ | ✅ | ⬚ | 🔶 | 🔶 | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ |
| Approve/publish results | ⬚ | ⬚ | ✅ | ⬚ | 🔶 | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| View own results/CGPA | ⬚ | ⬚ | 👁 | ⬚ | 🔶 | 🔶 | 🔶 | 🔶(own courses) | 🔶(advisees) | 🔶(self) | 🔶(policy+consent) |
| Configure fees | ⬚ | 🔶 | 👁 | ✅ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Confirm/reconcile payments | ⬚ | ⬚ | 👁 | ✅ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |
| Pay fees | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | 🔶(self) | 🔶(linked) |
| Request transcript | ⬚ | ⬚ | ✅(issue) | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | 🔶(self) | ⬚ |
| Allocate hostel | ⬚ | 🔶 | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | 🔶(apply) | ⬚ |
| NYSC mobilisation list | ⬚ | 👁 | ✅ | ⬚ | 🔶 | 🔶 | ⬚ | ⬚ | ⬚ | 👁(self) | ⬚ |
| Read student PII | break-glass | 🔶 | ✅ | 🔶(finance) | 🔶 | 🔶 | 🔶 | 🔶(class) | 🔶(advisees) | self | linked |
| Platform break-glass | ✅(gated) | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ | ⬚ |

\* Super Admin columns marked `(platform)` are platform-plane capabilities (managing the
tenant as a container), not reading the tenant's academic data. Reading student PII as
platform is **break-glass** only.

> This matrix is the starting catalogue. The real permission set lives in a versioned
> permission registry (see data model), and tenants compose roles from it.

### 4.6 Authentication & identity

- **Students/parents:** email + phone, password + OTP; phone-number-centric given the market.
  Passwordless/OTP login is a strong fit for low-end devices.
- **Staff:** institution SSO where available (SAML/OIDC), otherwise managed accounts with MFA
  for privileged roles.
- **Platform:** mandatory MFA; hardware-key/step-up for Super Admin and break-glass.
- **Sessions:** short-lived access tokens + refresh; device-aware; step-up re-auth for
  sensitive actions; all sessions revocable.

### 4.7 Why this model (rationale)

- **Scoped roles** map directly onto the faculty→department→programme reality, so "HOD of
  Computer Science" is expressible without a bespoke role per department.
- **Relationship predicates** keep the role catalogue small while enabling rich self-service
  (a lecturer sees *their* classes, an adviser *their* advisees, a parent *their* child).
- **Effective-dated assignments** give a defensible audit of authority over time — essential
  when a results dispute asks "who could approve this in 2027/2028 session?".
- **Separation of platform-admin from tenant-data-read** is the single most important control
  for trust and NDPA compliance.
