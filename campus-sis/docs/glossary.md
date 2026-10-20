# Glossary

Terminology used across ATLAS — Nigerian higher-education terms and PeopleSoft/SPIRE concepts.

## Nigerian higher education

- **JAMB** — Joint Admissions and Matriculation Board; conducts UTME and governs admissions.
- **UTME** — Unified Tertiary Matriculation Examination (the JAMB exam).
- **CAPS** — Central Admissions Processing System; JAMB's platform through which institutions
  make and candidates accept admission offers.
- **Post-UTME** — institution-level screening/test after UTME.
- **Direct Entry (DE)** — admission into 200-level via A-levels, ND, NCE, IJMB, etc.
- **Matriculation number (matric no.)** — the student's permanent institutional ID.
- **Carryover** — a failed course that must be re-registered and re-sat.
- **GST / GNS / GES** — General Studies courses required across programmes.
- **CA** — Continuous Assessment (coursework component of a course score).
- **CGPA** — Cumulative Grade Point Average (on a 5.0 scale for most universities; 4.0 for
  ND/HND).
- **GPA** — Grade Point Average for a single semester.
- **Degree classification** — First Class, Second Class Upper (2:1), Second Class Lower (2:2),
  Third Class, Pass — derived from final CGPA.
- **Senate** — the academic authority that approves results and graduation.
- **NUC** — National Universities Commission; the regulator (standards, accreditation,
  returns).
- **NYSC** — National Youth Service Corps; mandatory post-graduation service; institutions
  mobilise eligible graduands.
- **SIWES / IT** — Students' Industrial Work Experience Scheme (industrial training/placement).
- **Clearance** — multi-unit sign-off (library, bursary, department, hostel) before
  graduation/exit.
- **Acceptance fee** — fee paid to confirm an admission offer.
- **RRR** — Remita Retrieval Reference (a Remita payment code).
- **NDPA** — Nigeria Data Protection Act 2023 (data-protection law).
- **ND / HND / NCE** — National Diploma / Higher National Diploma (polytechnics) / Nigeria
  Certificate in Education (colleges of education).

## PeopleSoft Campus Solutions / SPIRE concepts

- **SPIRE** — Student Program for Integrated Records and Enrollment; UMass Amherst's branded
  instance of PeopleSoft Campus Solutions.
- **Campus Community** — the shared person-data foundation (biodata, IDs, service indicators,
  communications) every other module keys off.
- **Student Records** — academic structure, enrolment, grading, transcripts, academic
  standing.
- **Academic Advisement** — degree audit and what-if analysis.
- **Recruiting and Admissions** — the prospect→applicant→matriculant funnel.
- **Student Financials** — charges, student accounts, payments, holds.
- **Financial Aid** — aid packaging/disbursement (US concept; not a core ATLAS module).
- **Service indicator (hold)** — a positive/negative flag that enables or blocks actions
  (e.g. an unpaid-fees hold blocking registration).
- **3Cs** — Communications, Checklists, Comments.
- **EFFDT (effective date)** — PeopleSoft's effective-dating of rows so records resolve
  against the rule in force at a point in time. ATLAS adopts this for academic structure,
  curricula, grading, fees, and role assignments.
- **Career / Program / Plan / Sub-plan** — PeopleSoft's academic structure hierarchy;
  ATLAS maps these to career → programme → programme option.
- **Fluid UI** — PeopleSoft's responsive, role-based self-service UI layer.

## ATLAS concepts

- **Tenant** — one institution; the unit of isolation.
- **Power Admin / Super Admin** — the platform (our company) root administrator.
- **Break-glass access** — time-boxed, consent-gated, audited platform access into a tenant's
  data.
- **Program stack** — a student's programme enrolment history over time.
- **Ledger entry** — an immutable, append-only financial record; balances are derived from it.
- **Transactional outbox** — pattern guaranteeing side effects (notifications, reconciliation)
  are never lost.
- **Relationship predicate** — a dynamic access check (is_self, is_my_child, is_my_course)
  layered on top of roles.

## Sources

- Oracle PeopleSoft Campus Solutions — module overview:
  [Oracle docs](https://docs.oracle.com/cd/E29376_01/hrcs90r5/eng/psbooks/lsfn/htm/lsfn02.htm),
  [Campus Solutions overview](https://www.cleverence.com/articles/oracle-documentation/campus-solutions-overview-4927/)
- Nigerian university grading framework (CGPA / classifications):
  [NUC grading framework](https://openeducat.org/articles/nigeria-university-grading-system-cgpa-explained/)
- JAMB CAPS admissions:
  [CAPS overview](https://allschool.ng/caps-promotes-transparency-autonomy-jamb/),
  [JAMB admission guidelines](https://jamb.gov.ng/pdfs/2020_GUIDELINES_ON_ADMISSIONS.pdf)
