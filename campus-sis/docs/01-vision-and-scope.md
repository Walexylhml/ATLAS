# 01 — Vision & Scope

## Vision

**ATLAS is the system of record for the African student lifecycle.**

One integrated platform where a student exists once — from the moment they are admitted
through JAMB/CAPS, across every semester of registration, results, and fees, to graduation
and NYSC mobilisation — and where every member of staff, every parent, and the institution
itself works from that same single record.

We are not building a better registration portal. We are building the **integrated spine**
that Nigerian higher education never had: the thing PeopleSoft Campus Solutions is to a US
university, rebuilt for African realities and delivered as affordable, multi-tenant SaaS.

## Positioning

| | Typical NG university portal | LMS (Moodle/Canvas) | Foreign SIS (PeopleSoft/Banner) | **ATLAS** |
|---|---|---|---|---|
| Integrated student record | Partial | No | Yes | **Yes** |
| Multi-tenant SaaS | No | Yes | No | **Yes** |
| Nigerian admissions (JAMB/CAPS) | Partial | No | No | **Native** |
| NG grading / senate workflow | Partial | No | No | **Native** |
| Local fee rails + reconciliation | Partial | No | No | **Native** |
| Mobile-first, low-bandwidth | Rare | Partial | No | **Core** |
| Affordable for NG institutions | Varies | Yes | No | **Yes** |
| Configurable per institution | No (bespoke) | Limited | Yes (heavy) | **Yes (light)** |

**What we copy from PeopleSoft/SPIRE:** the integration philosophy (one identity, many
modules), effective-dated academic structures, a configuration/rules layer, and role-based
self-service.

**What we explicitly reject:** the 1990s technology stack (Tuxedo, PeopleCode, WebLogic),
the 18-month heavyweight deployments, and the desktop-era UX.

## Guiding principles

1. **One identity, many modules.** Every module reads from a single person/student record.
   No module owns a second copy of a student's identity.
2. **Configure, don't code.** Institutional variance (grading scales, fee structures,
   programme shapes, approval chains) is data, not a code branch. Onboarding a school is
   configuration, not a new build.
3. **Mobile-first, network-last.** Design for a low-end Android phone on intermittent 3G.
   If it works there, it works everywhere.
4. **Correctness is non-negotiable for money and results.** These are the two domains where
   a bug destroys trust permanently. Ledger discipline, idempotency, audit trails, and
   approval workflows are first-class.
5. **Least privilege, full audit.** Every sensitive action is permissioned and logged.
   NDPA compliance is designed in, not bolted on.
6. **Independently useful modules.** Each module delivers value on its own so we can ship
   and earn before the whole platform is complete.
7. **Build for everyone; sell to someone.** The platform serves universities, polytechnics,
   and colleges of education; the go-to-market stays focused on one beachhead at a time.

## Scope

### In scope (the full platform, sequenced)
Tenancy & configuration · Identity (Campus Community) · Admissions (JAMB/CAPS, Post-UTME,
direct entry) · Curriculum management · Student records & registration · Results, CGPA &
senate approval · Transcripts · Student financials & fee rails · Academic advising / degree
audit · Auxiliary (hostel, ID cards, NYSC, SIWES) · Communications · Platform administration
· Reporting & analytics.

### Out of scope
Full LMS (integrate instead) · payroll / core HR / institutional ERP finance · research
grants · library ILS internals · K-12.

### Deferred to later phases
Alumni / advancement · cross-institution credential-verification network · AI-assisted
advising and analytics.

## Target institution types (all supported by configuration)

- **Universities** — federal, state, private.
- **Polytechnics** — ND/HND structure, with their own grading (4.0 for ND/HND is common).
- **Colleges of Education** — NCE structure.

The configuration layer must express the differences between these (award types, grading
scales, programme structures, session/semester shapes) without code changes.
