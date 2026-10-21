# ATLAS — Academic Tracking, Learning, and Achievement System

A modern, multi-tenant **Student Information System (SIS)** for Nigerian and African
higher-education institutions — inspired by the *integration philosophy* of Oracle
PeopleSoft Campus Solutions (the system behind UMass Amherst's **SPIRE**), rebuilt on
a cloud-native, mobile-first, low-bandwidth-tolerant stack.

> **One student record. Every workflow. Every school, configured — not rebuilt.**

---

## Why this exists

Almost every Nigerian university, polytechnic and college of education runs its **own**
bespoke portal — built in-house by the ICT unit or bought from a local vendor. These
portals are mostly *registration + fee-payment front ends*. The rest of the student
lifecycle (admissions intake from JAMB/CAPS, results and senate approval, transcripts,
NYSC mobilisation, hostels) is fragmented across silos, spreadsheets, and manual process.

There is **no PeopleSoft/Banner-equivalent integrated SIS** serving this market. That gap
is the opportunity. The thing worth copying from PeopleSoft is not its 1990s technology
(Tuxedo, PeopleCode, WebLogic) — it is its core idea: **a single student identity that
every module reads from, and an institution-configurable rules engine so each school runs
its own policies without custom code.**

## What this repo is

This is the **planning and specification repository** for ATLAS. Code comes later.
The current deliverable is a robust **Business Requirements Document (BRD)** and the
supporting specifications needed to pick the project up at any time in the future.

## Project status

| | |
|---|---|
| **Phase** | Phase 0 — Foundation (build started) |
| **Team** | Whale (Adebayo Olawale) — founder/product; Claude — co-builder |
| **Last updated** | 2026-10-20 |
| **Next milestone** | Phase 1 started: student records + course catalogue landed (person-level scope now resolves) → course registration & student financials next |

> **Build started.** Stack locked (NestJS/TS · PostgreSQL+RLS · Render · Flutterwave — see
> [`docs/adr/`](docs/adr/)). The runnable code lives in [`apps/api`](apps/api/); what to open
> and provision is in [`docs/09-setup-and-resources.md`](docs/09-setup-and-resources.md).

## How to navigate

Read in this order. Each document stands alone but they are designed to be read top-to-bottom.

| # | Document | What it covers |
|---|----------|----------------|
| — | [`docs/00-brd.md`](docs/00-brd.md) | **Master BRD** — problem, goals, scope, stakeholders, success metrics. Start here. |
| 01 | [`docs/01-vision-and-scope.md`](docs/01-vision-and-scope.md) | Product vision, positioning, in/out of scope, guiding principles |
| 02 | [`docs/02-personas-and-rbac.md`](docs/02-personas-and-rbac.md) | **Every user class** (platform, institution, staff, student, parent) + the full RBAC model and permission matrix |
| 03 | [`docs/03-functional-requirements.md`](docs/03-functional-requirements.md) | Functional requirements per module, mapped to PeopleSoft/SPIRE |
| 04 | [`docs/04-data-model.md`](docs/04-data-model.md) | **The robust data model** — tenancy, identity, academic structure, results, financials, audit |
| 05 | [`docs/05-nonfunctional-requirements.md`](docs/05-nonfunctional-requirements.md) | Weak-network, mobile-first, security, NDPA compliance, quality bar |
| 06 | [`docs/06-architecture.md`](docs/06-architecture.md) | High-level architecture, multi-tenancy strategy, tech stack, offline/sync |
| 07 | [`docs/07-roadmap.md`](docs/07-roadmap.md) | Phased build plan and MVP definition |
| 08 | [`docs/08-open-questions.md`](docs/08-open-questions.md) | Decisions still pending |
| 09 | [`docs/09-setup-and-resources.md`](docs/09-setup-and-resources.md) | **Setup & resources** — accounts, services, secrets, costs, local dev |
| 10 | [`docs/10-academic-structure-and-results.md`](docs/10-academic-structure-and-results.md) | **Academic structure** (School→Faculty→Dept), access scoping, the grade upload/edit/approval lifecycle & bulk upload management |
| — | [`docs/adr/`](docs/adr/) | Locked architecture decisions (ADRs) |
| — | [`apps/api/`](apps/api/) | **ATLAS Core** — the runnable NestJS API (Phase 0) |
| — | [`docs/glossary.md`](docs/glossary.md) | Nigerian HE + PeopleSoft terminology |

## How to resume work (future pickup)

1. Read `docs/00-brd.md` and `docs/08-open-questions.md` to reload context.
2. Check the roadmap (`docs/07-roadmap.md`) for the current phase.
3. Open questions in doc 08 are the live decision queue — resolve top-down.

## Design north stars

- **One identity, many modules.** Everything keys off a single person/student record.
- **Configure, don't code.** Each tenant configures grading, fees, programmes, workflows as data.
- **Mobile-first, network-last.** Assume a cheap Android phone on 3G with intermittent signal.
- **Quality over speed.** Correct results, correct money, correct records. This system is a system of record.
- **Build for everyone; sell to someone.** Platform serves all institution types; go-to-market stays focused.
