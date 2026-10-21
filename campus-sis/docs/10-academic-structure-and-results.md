# 10 — Academic Structure, Access Scoping & the Results Lifecycle

This document specifies the **academic organisational structure** (School → Faculty →
Department), how **staff are placed and access is scoped** against it, and the **course &
grade upload / edit / approval lifecycle** including **bulk upload management**. It extends
[`02-personas-and-rbac.md`](02-personas-and-rbac.md) (the RBAC model) and
[`04-data-model.md`](04-data-model.md) (the data model) and is grounded in how Nigerian
universities actually run — see **Sources** at the end.

> **Design-now vs build-later.** The *structure, scoping and grading configuration* are
> buildable immediately (Phase 0). The *full results lifecycle* (score entry → approval →
> publish, CGPA) is Phase 2 in the roadmap. This document designs the whole thing **now** so
> the foundation we lay anticipates it and nothing load-bearing has to be retrofitted. §9
> states exactly what lands in which phase.

---

## 1. The academic hierarchy

Nigerian universities nest their academic units and everything answers to **Senate**:

```
Institution (tenant)
  └── School*          headed by a Provost / Dean of School   (top grouping)
        └── Faculty    headed by a Dean                        (Faculty Board of Examiners)
              └── Department   headed by a Head (HOD)           (Departmental Board of Examiners)
                    └── Programme   (a degree, e.g. B.Sc. Computer Science)
                          └── Course offering   (a course run in a given semester)
```

\* "School" is the top grouping ATLAS uses. In practice institutions name this level **College**
(headed by a *Provost*) or **School**; a few flat institutions have no level above Faculty.
ATLAS therefore makes the **School level optional** (a Faculty may sit directly under the
tenant) and lets each tenant **rename** the level — but the *scope ladder* is fixed so access
control is uniform. Faculty and School are commonly peers under a College; we deliberately
collapse to a single ordered ladder (**School ⊃ Faculty ⊃ Department**) because access control
needs an unambiguous containment order, not an org-chart.

**Heads of units** are recorded as a person reference on each unit (dean/provost/HOD), set
and changed through effective-dated **appointments** (see §3), not as a mutable column, so
"who was HOD when this result was approved" is always answerable.

### 1.1 Entities

| Entity | Parent | Natural key (per tenant) | Head | Notes |
|---|---|---|---|---|
| `school` | tenant | `code` | Provost / Dean of School | optional level; renamable label |
| `faculty` | school (nullable) | `code` | Dean | may sit directly under tenant if no school |
| `department` | faculty | `code` | HOD | the unit that owns programmes & courses |
| `programme` | department | `code` | — | a degree; `award`, `duration_years`, `max_level` |
| `academic_session` | tenant | `name` ("2025/2026") | — | one `is_current` per tenant |
| `academic_semester` | session | `ordinal` (first/second) | — | one `is_current`; entry windows live here |

Every row is tenant-owned and under the same **Row-Level Security** discipline as Phase 0
(a row is visible only within its own tenant or from platform context).

---

## 2. Access scoping against the hierarchy

### 2.1 Scope ladder

RBAC in ATLAS is **role + scope** (see `02` §4). This document fixes the **scope ladder** to
the academic hierarchy, from broadest to narrowest:

```
tenant  ⊃  school  ⊃  faculty  ⊃  department  ⊃  self
```

A grant is always made *at a scope*. "Dean, Faculty of Science" is the role `dean` at scope
`faculty:<science-id>`. **Containment is the core rule:** a grant at a higher level covers
every unit nested beneath it. A `faculty`-scoped grant covers that faculty's departments,
their programmes, and the courses and students within — resolved by walking the ancestry of
the target, never by enumerating a role per unit.

> This replaces the Phase-0 placeholder where `faculty`/`department`/`programme` scopes denied
> with "deferred to Phase 1." With the structure in place, `AuthzService` now resolves a
> target's ancestry (course → offering → programme → department → faculty → school) and a
> grant is satisfied when its scope ref appears anywhere on that chain at or above the
> target's level. Person targets whose academic placement is not yet modelled (pre–student-
> records) still defer — that is the only remaining gap, and it closes with Phase 1.

### 2.2 Scope types (change to the enum)

`scope_type` becomes `tenant | school | faculty | department | self`. `school` is **added**;
`programme` is retained as an academic entity but is **not** a scope level (programme-level
authority is expressed as a `department` grant plus a course-coordination assignment — §5.2).

### 2.3 Default-deny, SoD and step-up carry over

Unchanged from `02`: default posture is **deny**; **segregation of duties** forbids the same
person from both entering and approving results (§5.4); sensitive actions (publishing results,
changing a published grade) require **step-up re-authentication** and leave an immutable audit
trail.

---

## 3. How users are "placed in" the three categories

A member of staff is not scoped by a column on their account — they hold one or more
**appointments**, each an effective-dated placement at a unit that drives both their role and
their scope.

```
appointment = (person, unit_level, unit_id, role, effective_from, effective_to?)
```

- A Dean of the Faculty of Science → appointment `(dean, faculty, <science>)` → role `dean`
  at scope `faculty:<science>`.
- An HOD of Computer Science → `(hod, department, <csc>)`.
- A Provost/Dean of a School → `(provost, school, <college-of-science>)`.
- A lecturer belongs to a department but is additionally scoped to the **specific courses**
  they are assigned (§5.2) — the department appointment gives read context, the course
  assignment gives score-entry authority.

Appointments are effective-dated so authority is reconstructable over time ("who was HOD in
2027/2028?") and so acting/relieving appointments don't rewrite history. In the data model an
appointment materialises as a `role_assignment` (role + `scope_type` + `scope_ref_id` +
validity) — the machinery already exists; this document just defines how units populate
`scope_ref_id`.

Students are placed differently: a student belongs to a **programme** (hence a department,
faculty, school by ancestry) at a **level** (100–500). That placement is **Phase 1** (student
records); until then, student-targeted scope resolution defers (§2.1).

---

## 4. Courses, offerings and lecturer assignment

A **course** is a catalogue item owned by a department: `code` (e.g. `CSC101`), `title`,
`credit_units`, `level`, `semester`, and a `type` (Core / Required / Elective / General
Studies "GST"). A **course offering** is a course *run in a specific session + semester*, to
which **lecturers** are assigned and in which **registered students** earn scores. Separating
catalogue from offering is what lets the same course be taught across years with different
lecturers and class lists while the result history stays attributable to the right run.

| Concept | Owned by | Key fields |
|---|---|---|
| `course` (catalogue) | department | code, title, credit_units, level, semester, type |
| `course_offering` | course × session × semester | lecturer(s), coordinator, class size, entry window |
| `offering_enrolment` | offering × student | drives which students may receive a score (Phase 1) |

> Courses, offerings and registration are **Phase 1 curriculum + registration**. This document
> defines them so the results design below is complete; the structure/grading we build now
> does not depend on them existing yet.

---

## 5. The grade upload, edit & approval lifecycle

This is the correctness-critical heart of the system — a system of record for academic
outcomes. The design is **state-machine driven, append-only in spirit, and segregation-of-
duties enforced**.

### 5.1 What a score is

For each `(offering, student)` a **score sheet row** holds:

- **CA components** (tests, assignments, quizzes) summing to the CA cap, and the **exam** mark.
- CA and exam are combined by the offering's **weighting** (default **CA 40% / exam 60%**,
  configurable per tenant — some run 30/70). Total → letter grade + grade point via the
  tenant's **grading scheme** (§6).
- A **status** (below), the **grading-scheme version** used (so a later scheme change never
  silently re-grades a published result), and full audit (who, when).

### 5.2 Who may enter and edit

| Actor | Authority |
|---|---|
| **Lecturer (assigned to the offering)** | Enter/edit CA + exam scores for **their** offering, **only while the sheet is in `draft`/`returned`**. Resolved by the course assignment, not just the department appointment. |
| **Course Coordinator** | For multi-section / large courses (e.g. GST), consolidate section lecturers' scores. |
| **Exam Officer (departmental)** | Collate and **validate** the department's sheets; move them toward approval. **Cannot enter a lecturer's marks** (SoD). |
| **HOD / Dean / Senate** | **Approve** at their level; never enter marks. |

### 5.3 State machine

```
draft ──submit──▶ submitted ──dept approve──▶ dept_approved ──faculty approve──▶ faculty_approved ──senate publish──▶ published(LOCKED)
  ▲                   │                            │                                   │
  └──────── returned ◀┴──── return-for-correction ◀┴───────────────────────────────────┘
```

- **draft** — lecturer is entering/editing. The only state in which raw marks change.
- **submitted** — lecturer submits; the sheet **locks to the lecturer**. Exam officer validates.
- **dept_approved** — Departmental Board of Examiners (HOD) approves.
- **faculty_approved** — Faculty Board of Examiners (Dean) approves.
- **published** — **Senate** approves and publishes; results become visible to students and the
  sheet is **immutable**. CGPA/academic-standing recompute off published results only.
- **returned** — any approver can return a sheet *down* with a required reason; it re-opens to
  `draft` for the lecturer. Every transition is audited with actor, timestamp and reason.

The approval chain (Departmental → Faculty → Senate) is exactly the Nigerian practice the
research confirmed; the Dean chairs the Faculty Board, the HOD the Departmental Board.

### 5.4 Segregation of duties (enforced, not advisory)

- The account that **entered/last-edited** a sheet's marks may **not** be the account that
  **approves** it at any level. The guard checks this at each transition.
- **Enter** (`results.score.enter`, lecturer) and **approve** (`results.approve.department`
  etc.) are distinct permissions that must not sit on the same assignment for the same unit;
  conflicting grants are flagged at assignment time.

### 5.5 Changing a published grade

Published results are immutable, so a correction is a **new, dual-approved event**, never an
in-place edit:

1. A privileged initiator (registrar / HOD) raises a **grade-change request** with the old
   value, new value and a **mandatory reason**, under **step-up** re-authentication.
2. A **second, different** approver (maker-checker) authorises it.
3. The change is applied as a **new versioned record**; the prior published value is retained,
   the audit entry is immutable, and the result is **re-published** so downstream CGPA
   recomputes. Nothing is overwritten.

---

## 6. Grading configuration (tenant-owned, versioned)

Each tenant configures its own scheme as **data**; ATLAS seeds the classic Nigerian default:

| Grade | Score | Point | Pass |
|---|---|---|---|
| A | 70–100 | 5.00 | ✓ |
| B | 60–69 | 4.00 | ✓ |
| C | 50–59 | 3.00 | ✓ |
| D | 45–49 | 2.00 | ✓ |
| E | 40–44 | 1.00 | ✓ |
| F | 0–39 | 0.00 | ✗ |

Pass mark **40**. **Degree classification** (on CGPA): First Class 4.50–5.00, Second Class
Upper (2:1) 3.50–4.49, Second Class Lower (2:2) 2.40–3.49, Third Class 1.50–2.39, Pass
1.00–1.49. **CGPA = Σ(grade point × credit units) ÷ Σ(credit units registered)**.

A scheme is **versioned** and every published score row records the scheme version it was
graded under, so amending the scheme (new tenant, new policy) never retroactively changes a
sealed result. The CGPA engine itself (exhaustively tested, with carryover/resit rules) is
**Phase 2**; this slice provides the configuration it will read.

---

## 7. Upload management (bulk score upload)

Most lecturers will not hand-enter a 400-student GST class, and the network is weak. Upload
management is therefore a first-class, defensive subsystem — not an afterthought.

### 7.1 Principles

- **Template-driven.** The lecturer downloads a CSV/XLSX **template** pre-filled with the
  offering's registered students (matric, name, locked) and empty CA/exam columns. Column
  mapping is fixed by the template, eliminating "which column is the exam?" ambiguity.
- **Dry-run first.** Every upload is **validated and previewed** before anything is written:
  matric exists and is **enrolled in this offering**, scores are numeric and within range,
  CA components don't exceed the cap, no duplicate rows, no unknown students. The lecturer sees
  a row-by-row report (accepted / rejected + reason) and a downloadable error file, and only
  then confirms.
- **Idempotent upsert.** Writes key on `(offering, student)`. Re-uploading a corrected file
  overwrites **only `draft` rows**; rows already submitted/approved are refused and reported,
  never silently changed. Re-running the same file is a no-op — safe over a flaky connection
  that may retry.
- **Atomic batch with partial-failure policy.** A batch is recorded as an **upload batch**
  (who, when, file checksum, row counts, outcome) in the transactional **outbox/audit**; the
  tenant chooses **all-or-nothing** or **accept-valid-skip-invalid** (default: preview then
  all-or-nothing on confirm). Either way the batch is the unit of provenance.
- **Versioned & reversible while draft.** Each batch is retained; a bad upload can be rolled
  back to the previous draft state *before* submission. After submission the state machine
  (§5) governs.

### 7.2 Weak-network & offline resilience

- The **student/staff PWA** caches the class list and accepts **offline entry**; scores sync
  when connectivity returns, with **optimistic-lock** conflict resolution (the `version`
  column) so a stale device can't clobber a newer edit — it's told to refresh and re-apply.
- Uploads are **resumable/chunked** where the file is large; the server deduplicates by file
  checksum so a half-sent, retried upload doesn't double-write.
- Everything the lecturer needs to complete entry (template, class list) is available offline;
  only the final submit requires the server.

### 7.3 Provenance, audit & privacy

- Every batch and every manual edit writes an **`audit_log`** entry (actor, before/after,
  IP, assurance level) and an **`event_outbox`** event for downstream (notifications,
  analytics) — in the **same transaction** as the write, so a crash can't lose the side effect.
- Scores are **personal data (NDPA)**. Access is scope-gated (a lecturer sees only their
  offerings; an HOD only their department); bulk PII exports require **DPO/registrar approval**
  and are **watermarked and logged** (`02` §4.4).

---

## 8. Other robust considerations

- **Academic calendar gates everything.** Score entry is only open while the semester's
  **entry window** is open; the window is a property of `academic_semester`, enforced centrally
  so "results submitted after the deadline" is a policy, not a scramble.
- **Levels & carryover.** A student has a **level** (100–500) within a programme; failed
  (carryover) courses are re-registered and re-scored in a later session — the offering/score
  model already supports this because scores key on *offering* (a specific run), not course.
- **Course registration is the gate.** Only students with an `offering_enrolment` can receive a
  score; this prevents phantom marks and ties results to the registration/fees flow (Phase 1).
- **External moderation.** Final-year and some higher-level papers are externally moderated
  before exams; the model records a moderation step/flag on the offering so it's auditable.
- **Concurrency.** Multi-section courses consolidate through a **course coordinator**; the
  `version` optimistic lock prevents two editors from silently overwriting each other.
- **Historical accuracy.** Effective-dated appointments + versioned schemes + immutable
  published results mean the system can always reconstruct *who could do what, under which
  policy, when* — essential for result disputes and NUC/regulatory review.
- **Configure, don't code.** Weighting (40/60 vs 30/70), grade bands, pass mark, degree
  classes, number of semesters, School-level naming, and whether the School level exists at all
  are **tenant configuration**, resolved at runtime through the config/rules service — no
  per-institution code.

---

## 9. Phasing — what we build in which slice

| Slice | Contents | Depends on |
|---|---|---|
| **This slice (Phase 0 completion)** | `school`/`faculty`/`department`/`programme` tables; academic calendar (session/semester); grading scheme + bands + degree classes (seeded Nigerian default); **`school` scope + real scope containment in `AuthzService`**; staff **appointments** populating scoped role assignments; `academic.read` / `academic.manage` permissions; dean/HOD/provost role templates; read + configure endpoints. | Phase 0 auth/RBAC (done) |
| **Phase 1** | Course catalogue, programme curricula, course **offerings**, **course registration** + enrolment, student records (programme stack, level). Unlocks student-targeted scope and score rows. | this slice |
| **Phase 2** | Score entry (CA + exam), the **state machine & approval chain** (§5), **bulk upload management** (§7), grade-change dual-approval, the **CGPA engine** (exhaustively tested) and transcripts. | Phase 1 |

The sequencing matches the roadmap (`07`): foundation first, then fees + registration, then
results. This document ensures the foundation we lay now carries the full results design
without rework.

---

## 10. Open questions

1. **School level:** make it optional-but-present (recommended), or let each tenant switch it
   on? Default naming — "School", "College", or tenant-chosen label?
2. **CA/exam weighting:** confirm 40/60 as the seeded default; expose per-offering override?
3. **Pass mark:** 40 (E) universally, or per-tenant (some use 45)?
4. **Approval chain depth:** is the Departmental → Faculty → Senate chain uniform, or do some
   tenants add a College/School board between Faculty and Senate?
5. **External moderation:** model as a required gate on final-year offerings, or an optional
   flag?
6. **Grade-change authority:** who may *initiate* (registrar only, or HOD+), and who is the
   mandatory second approver?

---

## Sources

- [An Overview of University Education and Administration in Nigeria](https://www.nimibriggs.org/an-overview-of-university-education-and-administration-in-nigeria/) — College/Faculty/School/Department hierarchy, Provost/Dean/HOD, Senate, Registrar.
- [ABU Dept. of Computer Science — Examinations Office](https://physicalsciences.abu.edu.ng/department/dcs/public/exams-office.php) — CA 40% / exam 60%, moderation, Departmental → Faculty Board of Examiners → Senate approval chain.
- [Nigeria University Grading System (CGPA) explained](https://openeducat.org/articles/nigeria-university-grading-system-cgpa-explained/) — 5-point grade bands, CGPA formula, degree classification ranges.
